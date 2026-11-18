// Pi session logs: <sessions>/--<cwd>--/<time>_<id>.jsonl, one session per file (docs/collector-spec.md 「Pi」).
import { isAbsolute, join, resolve } from 'node:path';

import { describeError, type Diagnostics } from '../diagnostics.js';
import { compareStrings, isRecord } from '../fsutil.js';
import type { PiUsage } from '../types.js';
import type { SkillRef } from './codex.js';
import { dateRange, forEachLine, incr, listFilesRecursive, modelKey, runPool, type Progress } from './lines.js';

const SESSION_HEADER_MARK = Buffer.from('"type":"session"');
const ASSISTANT_MARK = Buffer.from('"role":"assistant"');
const USER_MARK = Buffer.from('"role":"user"');
const NESTED_CALLS_MARK = Buffer.from('"nestedCalls"');
const TIMESTAMP_MARK = Buffer.from('"timestamp":"');
const DATE_LENGTH = 10;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** What `/skill:name` puts at the start of the user message (agent-session.ts `parseSkillBlock`). */
const SKILL_BLOCK_PATTERN = /^<skill name="([^"]+)" location="([^"]+)">/;
const SKILL_FILE_SUFFIX = '/SKILL.md';
const MCP_TOOL_PREFIX = 'mcp__';
const SUBAGENT_TOOL = 'subagent';
const READ_TOOL = 'read';
/** Pi's built-in tools (core/tools/index.ts) and the tools of its built-in extensions. Extension tools are not counted by name. */
export const PI_BUILTIN_TOOLS: ReadonlySet<string> = new Set([
  'read', 'bash', 'powershell', 'edit', 'write', 'grep', 'find', 'ls', 'codemode', 'tool_search',
]);
const FILE_CONCURRENCY = 8;
const PROGRESS_EVERY_FILES = 100;

export type PiSessionScan = {
  usage: PiUsage;
  mcpToolCalls: Map<string, number>;      // full `mcp__<server>__<tool>` name -> calls; matched to servers later, never exported
  skillRefs: Map<string, SkillRef>;       // absolute skill file path (read or /skill location) -> turns; never exported
  skillNameRefs: Map<string, SkillRef>;   // /skill:<name> -> turns, for when the location no longer resolves
  modelCounts: Map<string, number>;       // validated model id -> assistant messages
  days: Set<string>;                      // YYYY-MM-DD; for the cross-tool union only, never written to the profile
};

type Accumulator = {
  callKeys: Set<string>;
  messageKeys: Set<string>;
  days: Set<string>;
  builtin: Map<string, number>;
  mcpToolCalls: Map<string, number>;
  skillRefs: Map<string, SkillRef>;
  skillNameRefs: Map<string, SkillRef>;
  models: Map<string, number>;
  outputTokens: number;
  toolCalls: number;
  mcpTotal: number;
  subagentRuns: number;
  badLines: number;
};

/** Per file. `turn` is the key of the latest user message: skill uses count once per skill per turn. */
type FileState = { first: boolean; cwd: string | null; turn: string };

/**
 * An entry is identified by its id and timestamp together. `/fork` and `/clone` copy entries into the new file with
 * both unchanged, and the 8-hex-digit ids alone can repeat across unrelated sessions.
 */
function entryKey(record: Record<string, unknown>): string | null {
  return typeof record.id === 'string' && typeof record.timestamp === 'string' ? `${record.id}@${record.timestamp}` : null;
}

function addRef(refs: Map<string, SkillRef>, key: string, turn: string, at: string | null): void {
  const ref = refs.get(key) ?? { turns: new Set<string>(), last: null };
  ref.turns.add(turn);
  if (at !== null && (ref.last === null || at > ref.last)) ref.last = at;
  refs.set(key, ref);
}

/** The read tool takes `path` (relative or absolute, `@` prefix and `~` allowed). Only SKILL.md reads count. */
function skillReadPath(args: unknown, file: FileState, home: string): string | null {
  if (!isRecord(args) || typeof args.path !== 'string') return null;
  const raw = args.path.trim().replace(/^@/, '');
  if (!raw.endsWith(SKILL_FILE_SUFFIX)) return null;
  if (raw.startsWith('~/')) return join(home, raw.slice(2));
  if (isAbsolute(raw)) return raw;
  return file.cwd === null ? null : resolve(file.cwd, raw);
}

/** single → 1 agent; `tasks` (parallel) and `chain` start one agent per item. */
function subagentRuns(args: unknown): number {
  if (!isRecord(args)) return 1;
  for (const key of ['tasks', 'chain']) {
    const list = args[key];
    if (Array.isArray(list) && list.length > 0) return list.length;
  }
  return 1;
}

type Call = { id: unknown; name: unknown; args: unknown };

function countCall(acc: Accumulator, file: FileState, call: Call, at: string | null, home: string): void {
  if (typeof call.name !== 'string' || call.name.length === 0) return;
  if (typeof call.id === 'string') {
    const key = `${at ?? ''}|${call.id}`;
    if (acc.callKeys.has(key)) return;
    acc.callKeys.add(key);
  }
  const { name } = call;
  acc.toolCalls += 1;
  if (name.startsWith(MCP_TOOL_PREFIX)) {
    acc.mcpTotal += 1;
    incr(acc.mcpToolCalls, name);
  } else if (name === SUBAGENT_TOOL) {
    acc.subagentRuns += subagentRuns(call.args);
  }
  if (PI_BUILTIN_TOOLS.has(name)) incr(acc.builtin, name);
  if (name === READ_TOOL) {
    const path = skillReadPath(call.args, file, home);
    if (path !== null) addRef(acc.skillRefs, path, file.turn, at);
  }
}

function firstText(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const block = content.find((c): c is Record<string, unknown> => isRecord(c) && c.type === 'text');
  return block && typeof block.text === 'string' ? block.text : null;
}

function readUser(acc: Accumulator, file: FileState, message: Record<string, unknown>, key: string | null, at: string | null): void {
  if (key !== null) file.turn = `turn:${key}`;
  const match = SKILL_BLOCK_PATTERN.exec(firstText(message.content) ?? '');
  if (!match) return;
  const [, name, location] = match as unknown as [string, string, string];
  if (isAbsolute(location)) addRef(acc.skillRefs, location, file.turn, at);
  addRef(acc.skillNameRefs, name, file.turn, at);
}

function outputTokensOf(usage: unknown): number {
  const output = isRecord(usage) ? usage.output : undefined;
  return typeof output === 'number' && Number.isFinite(output) && output >= 0 ? output : 0;
}

function readAssistant(acc: Accumulator, file: FileState, message: Record<string, unknown>, key: string | null, at: string | null, home: string): void {
  // One count per assistant message; a forked file repeats its parent's messages under the same key.
  if (typeof message.model === 'string' && message.model.trim().length > 0 && !(key !== null && acc.messageKeys.has(key))) {
    if (key !== null) acc.messageKeys.add(key);
    // Router ids such as `anthropic/claude-sonnet-4.5` keep only the model part, so the class mapping still applies.
    incr(acc.models, modelKey(message.model.slice(message.model.lastIndexOf('/') + 1)));
    acc.outputTokens += outputTokensOf(message.usage);
  }
  if (!Array.isArray(message.content)) return;
  for (const block of message.content) {
    if (isRecord(block) && block.type === 'toolCall') countCall(acc, file, { id: block.id, name: block.name, args: block.arguments }, at, home);
  }
}

/** Calls a tool made while it ran (codemode scripts). With the default MCP exposure, MCP calls only show up here. */
function readToolResult(acc: Accumulator, file: FileState, message: Record<string, unknown>, at: string | null, home: string): void {
  if (!isRecord(message.nestedCalls) || !Array.isArray(message.nestedCalls.calls)) return;
  for (const c of message.nestedCalls.calls) {
    if (isRecord(c)) countCall(acc, file, { id: c.id, name: c.name, args: c.arguments }, at, home);
  }
}

function readRecord(acc: Accumulator, file: FileState, record: unknown, home: string): void {
  if (!isRecord(record)) return;
  if (record.type === 'session') {
    if (typeof record.cwd === 'string' && isAbsolute(record.cwd)) file.cwd = record.cwd;
    return;
  }
  if (record.type !== 'message' || !isRecord(record.message)) return;
  const key = entryKey(record);
  const at = typeof record.timestamp === 'string' ? record.timestamp : null;
  const { message } = record;
  if (message.role === 'user') readUser(acc, file, message, key, at);
  else if (message.role === 'assistant') readAssistant(acc, file, message, key, at, home);
  else if (message.role === 'toolResult') readToolResult(acc, file, message, at, home);
}

function scanLine(acc: Accumulator, file: FileState, line: Buffer, home: string): void {
  const ts = line.indexOf(TIMESTAMP_MARK);
  if (ts !== -1) {
    const start = ts + TIMESTAMP_MARK.length;
    const day = line.toString('latin1', start, start + DATE_LENGTH);
    if (DATE_PATTERN.test(day)) acc.days.add(day);
  }
  const header = file.first && line.indexOf(SESSION_HEADER_MARK) !== -1;
  file.first = false;
  if (!header && line.indexOf(ASSISTANT_MARK) === -1 && line.indexOf(USER_MARK) === -1 && line.indexOf(NESTED_CALLS_MARK) === -1) return;
  try {
    readRecord(acc, file, JSON.parse(line.toString('utf8')) as unknown, home);
  } catch {
    acc.badLines += 1;
  }
}

function sortedRecord(map: ReadonlyMap<string, number>): Record<string, number> {
  return Object.fromEntries([...map].sort((a, b) => compareStrings(a[0], b[0])));
}

/** A root nested in another one would list its files twice, so paths are deduped. */
async function listSessionFiles(roots: readonly string[]): Promise<string[]> {
  const out = new Set<string>();
  for (const root of new Set(roots)) for (const rel of await listFilesRecursive(root, '.jsonl')) out.add(join(root, rel));
  return [...out].sort(compareStrings);
}

/**
 * Aggregates every `*.jsonl` under the given session roots. Only lines with a marker are parsed: the header (for
 * cwd), user messages (turns and `/skill:` blocks), assistant messages (model, tool calls) and tool results with
 * nestedCalls. Activity dates come from entry timestamps.
 */
export async function scanPiSessions(
  roots: readonly string[],
  home: string,
  diag: Diagnostics,
  onProgress?: Progress,
): Promise<PiSessionScan> {
  const files = await listSessionFiles(roots);
  const acc: Accumulator = {
    callKeys: new Set(), messageKeys: new Set(), days: new Set(), builtin: new Map(), mcpToolCalls: new Map(),
    skillRefs: new Map(), skillNameRefs: new Map(), models: new Map(), outputTokens: 0, toolCalls: 0, mcpTotal: 0, subagentRuns: 0, badLines: 0,
  };
  let done = 0;
  await runPool(files, FILE_CONCURRENCY, async (path) => {
    const file: FileState = { first: true, cwd: null, turn: `file:${path}` };
    try {
      await forEachLine(path, (line) => scanLine(acc, file, line, home));
    } catch (err) {
      diag.warn(path, `읽기 실패 (${describeError(err)})`);
    }
    done += 1;
    if (onProgress && (done % PROGRESS_EVERY_FILES === 0 || done === files.length)) onProgress(done, files.length);
  });
  if (acc.badLines > 0) diag.warn(roots[0] ?? home, `JSON 파싱 실패 줄 ${acc.badLines}개 건너뜀`);
  return {
    usage: {
      sessions: files.length,
      toolCalls: acc.toolCalls,
      builtinTools: sortedRecord(acc.builtin),
      mcpCalls: acc.mcpTotal,
      subagentRuns: acc.subagentRuns,
      models: sortedRecord(acc.models),
      outputTokens: acc.outputTokens,
      ...dateRange(acc.days),
    },
    mcpToolCalls: acc.mcpToolCalls,
    skillRefs: acc.skillRefs,
    skillNameRefs: acc.skillNameRefs,
    modelCounts: acc.models,
    days: acc.days,
  };
}
