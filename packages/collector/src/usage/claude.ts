import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { describeError, type Diagnostics } from '../diagnostics.js';
import { compareStrings, isMissing, isRecord } from '../fsutil.js';
import type { ClaudeUsage } from '../types.js';
import { dateRange, forEachLine, incr, listFilesRecursive, modelKey, runPool, type Progress } from './lines.js';

const TOOL_USE_MARK = Buffer.from('"tool_use"');
const COMMAND_MARK = Buffer.from('<command-name>');
const TIMESTAMP_MARK = Buffer.from('"timestamp":"');
const DATE_LENGTH = 10;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COMMAND_NAME_PATTERN = /<command-name>\/?([^<\s]+)<\/command-name>/g;
/** Assistant records open their message with the model; on 102k real lines `"message":{` sat within the first 206 bytes. */
const MESSAGE_HEAD_BYTES = 1024;
const MESSAGE_MARK = Buffer.from('"message":{');
const MODEL_MARK = Buffer.from('"model":"');
const ID_MARK = Buffer.from('"id":"');
const CONTENT_MARK = Buffer.from('"content":');
/** message.usage is written after content; output_tokens is its first key of that name (before output_tokens_details). */
const USAGE_MARK = Buffer.from('"usage":{');
const OUTPUT_TOKENS_MARK = Buffer.from('"output_tokens":');
const DIGIT_0 = 0x30;
const DIGIT_9 = 0x39;
const QUOTE = 0x22;
/** Placeholder model on locally generated messages (errors, interruptions); not a model the user ran. */
const SYNTHETIC_MODEL = '<synthetic>';

const FILE_CONCURRENCY = 8;
export const PROGRESS_EVERY_FILES = 100;

export type ClaudeTranscriptScan = {
  usage: ClaudeUsage;
  mcpCalls: Map<string, number>;   // normalized server name -> calls
  skillCalls: Map<string, number>; // Skill tool input.skill -> calls
  slashCalls: Map<string, number>; // <command-name>/x</command-name> -> count
  agentCalls: Map<string, number>; // Agent/Task input.subagent_type -> calls
  days: Set<string>;               // YYYY-MM-DD; for the cross-tool union only, never written to the profile
};

type Accumulator = {
  toolIds: Set<string>;
  days: Set<string>;
  builtin: Map<string, number>;
  mcpCalls: Map<string, number>;
  skillCalls: Map<string, number>;
  slashCalls: Map<string, number>;
  agentCalls: Map<string, number>;
  messageIds: Set<string>;
  models: Map<string, number>;
  /** message.id -> largest output_tokens seen; streaming repeats usage with growing values. */
  outputById: Map<string, number>;
  /** Output tokens of messages without an id (each line counts). */
  outputNoId: number;
  badLines: number;
};

/** `mcp__<server>__<tool>` -> server (assumes no `__` inside the server name). */
export function mcpServerOf(toolName: string): string | null {
  if (!toolName.startsWith('mcp__')) return null;
  const end = toolName.indexOf('__', 5);
  return end > 5 ? toolName.slice(5, end) : null;
}

function countToolUse(acc: Accumulator, block: Record<string, unknown>): void {
  const { id, name, input } = block;
  if (typeof id !== 'string' || typeof name !== 'string' || acc.toolIds.has(id)) return;
  acc.toolIds.add(id);
  const args = isRecord(input) ? input : {};
  if (name.startsWith('mcp__')) {
    const server = mcpServerOf(name);
    if (server) incr(acc.mcpCalls, server);
  } else if (name === 'Skill') {
    if (typeof args.skill === 'string') incr(acc.skillCalls, args.skill.replace(/^\//, ''));
  } else if (name === 'Agent' || name === 'Task') {
    if (typeof args.subagent_type === 'string') incr(acc.agentCalls, args.subagent_type);
  } else {
    incr(acc.builtin, name);
  }
}

function countRecord(acc: Accumulator, record: unknown): void {
  if (!isRecord(record) || !isRecord(record.message)) return;
  const content = record.message.content;
  if (record.type === 'assistant' && Array.isArray(content)) {
    for (const block of content) {
      if (isRecord(block) && block.type === 'tool_use') countToolUse(acc, block);
    }
  } else if (record.type === 'user' && typeof content === 'string') {
    for (const m of content.matchAll(COMMAND_NAME_PATTERN)) incr(acc.slashCalls, m[1] as string);
  }
}

/** One count per API message: a message is split over several lines (one per content block) sharing message.id. */
function countModel(acc: Accumulator, model: string, id: string | null): void {
  if (model === SYNTHETIC_MODEL) return;
  if (id !== null) {
    if (acc.messageIds.has(id)) return;
    acc.messageIds.add(id);
  }
  incr(acc.models, modelKey(model));
}

function addOutput(acc: Accumulator, model: string, id: string | null, tokens: number | null): void {
  if (tokens === null || model === SYNTHETIC_MODEL) return;
  if (id === null) {
    acc.outputNoId += tokens;
    return;
  }
  if (tokens > (acc.outputById.get(id) ?? -1)) acc.outputById.set(id, tokens);
}

/** Digits right after `at`, or null. */
function integerAt(line: Buffer, at: number): number | null {
  let end = at;
  while (end < line.length && (line[end] as number) >= DIGIT_0 && (line[end] as number) <= DIGIT_9) end += 1;
  return end === at ? null : Number(line.toString('latin1', at, end));
}

/**
 * message.usage.output_tokens without JSON.parse: the last `"usage":{` in the line, which must come after the message's
 * `"content":`. Text inside content is a JSON string, where the quotes are escaped and the mark cannot match, so only an
 * object in content could; lines whose content holds objects (tool_use input) are parsed instead and never come here.
 */
function fastOutputTokens(line: Buffer, content: number): number | null {
  const usage = line.lastIndexOf(USAGE_MARK);
  if (usage === -1 || usage < content) return null;
  const out = line.indexOf(OUTPUT_TOKENS_MARK, usage + USAGE_MARK.length);
  return out === -1 ? null : integerAt(line, out + OUTPUT_TOKENS_MARK.length);
}

function quotedAfter(line: Buffer, at: number, mark: Buffer): string | null {
  const start = at + mark.length;
  const end = line.indexOf(QUOTE, start);
  return end === -1 ? null : line.toString('utf8', start, end);
}

/**
 * Reads message.model / message.id without JSON.parse or a full-line search. Only a message object that opens with
 * `"model":"` within the first MESSAGE_HEAD_BYTES counts (that is how assistant records are written; user and system
 * messages open with "role"), and the id must come before `"content":`, so a `"model"` key inside tool input is never
 * used. Other lines get a model only when they are parsed anyway (tool_use / slash-command lines).
 */
function fastModel(line: Buffer): { model: string; id: string | null; content: number } | null {
  const msg = line.subarray(0, MESSAGE_HEAD_BYTES).indexOf(MESSAGE_MARK);
  if (msg === -1) return null;
  const model = msg + MESSAGE_MARK.length;
  if (line.compare(MODEL_MARK, 0, MODEL_MARK.length, model, model + MODEL_MARK.length) !== 0) return null;
  const content = line.indexOf(CONTENT_MARK, msg);
  const id = line.indexOf(ID_MARK, msg);
  if (content === -1 || (id !== -1 && id > content)) return null;
  const name = quotedAfter(line, model, MODEL_MARK);
  return name === null ? null : { model: name, id: id === -1 ? null : quotedAfter(line, id, ID_MARK), content };
}

function parsedOutputTokens(message: Record<string, unknown>): number | null {
  const tokens = isRecord(message.usage) ? message.usage.output_tokens : undefined;
  return typeof tokens === 'number' && Number.isFinite(tokens) && tokens >= 0 ? tokens : null;
}

/** Model (when the fast path missed it) and output tokens from a parsed assistant line. */
function countParsedMessage(acc: Accumulator, record: unknown, fastHit: boolean): void {
  if (!isRecord(record) || record.type !== 'assistant' || !isRecord(record.message)) return;
  const { model, id } = record.message;
  if (typeof model !== 'string') return;
  const messageId = typeof id === 'string' ? id : null;
  if (!fastHit) countModel(acc, model, messageId);
  addOutput(acc, model, messageId, parsedOutputTokens(record.message));
}

function scanLine(acc: Accumulator, line: Buffer): void {
  const ts = line.indexOf(TIMESTAMP_MARK);
  if (ts !== -1) {
    const start = ts + TIMESTAMP_MARK.length;
    const day = line.toString('latin1', start, start + DATE_LENGTH);
    if (DATE_PATTERN.test(day)) acc.days.add(day);
  }
  const fast = fastModel(line);
  if (fast) countModel(acc, fast.model, fast.id);
  if (line.indexOf(TOOL_USE_MARK) === -1 && line.indexOf(COMMAND_MARK) === -1) {
    if (fast) addOutput(acc, fast.model, fast.id, fastOutputTokens(line, fast.content));
    return;
  }
  try {
    const record: unknown = JSON.parse(line.toString('utf8'));
    countParsedMessage(acc, record, fast !== null);
    countRecord(acc, record);
  } catch {
    acc.badLines += 1;
  }
}

async function countProjectDirs(projectsDir: string): Promise<number> {
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).length;
  } catch (err) {
    if (isMissing(err)) return 0;
    throw err;
  }
}

function sortedRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...map.entries()].sort((a, b) => compareStrings(a[0], b[0])));
}

/** Aggregates `<claudeDir>/projects/**\/*.jsonl` by streaming lines; only lines with markers are parsed. */
export async function scanClaudeTranscripts(
  claudeDir: string,
  diag: Diagnostics,
  onProgress?: Progress,
): Promise<ClaudeTranscriptScan> {
  const projectsDir = join(claudeDir, 'projects');
  const files = await listFilesRecursive(projectsDir, '.jsonl');
  const acc: Accumulator = {
    toolIds: new Set(), days: new Set(), builtin: new Map(), mcpCalls: new Map(),
    skillCalls: new Map(), slashCalls: new Map(), agentCalls: new Map(), messageIds: new Set(), models: new Map(),
    outputById: new Map(), outputNoId: 0, badLines: 0,
  };
  let done = 0;
  await runPool(files, FILE_CONCURRENCY, async (rel) => {
    try {
      await forEachLine(join(projectsDir, rel), (line) => scanLine(acc, line));
    } catch (err) {
      diag.warn(join(projectsDir, rel), `읽기 실패 (${describeError(err)})`);
    }
    done += 1;
    if (onProgress && (done % PROGRESS_EVERY_FILES === 0 || done === files.length)) onProgress(done, files.length);
  });
  if (acc.badLines > 0) diag.warn(projectsDir, `JSON 파싱 실패 줄 ${acc.badLines}개 건너뜀`);

  const parts = files.map((f) => f.split('/'));
  return {
    usage: {
      sessions: parts.filter((p) => p.length === 2).length,
      subagentRuns: parts.filter((p) => p.length === 4 && p[2] === 'subagents').length,
      projects: await countProjectDirs(projectsDir),
      toolCalls: acc.toolIds.size,
      builtinTools: sortedRecord(acc.builtin),
      models: sortedRecord(acc.models),
      outputTokens: [...acc.outputById.values()].reduce((a, b) => a + b, acc.outputNoId),
      ...dateRange(acc.days),
    },
    mcpCalls: acc.mcpCalls,
    skillCalls: acc.skillCalls,
    slashCalls: acc.slashCalls,
    agentCalls: acc.agentCalls,
    days: acc.days,
  };
}
