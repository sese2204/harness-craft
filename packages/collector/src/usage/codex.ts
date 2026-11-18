import { isAbsolute, join, resolve } from 'node:path';

import { describeError, type Diagnostics } from '../diagnostics.js';
import { compareStrings, isRecord } from '../fsutil.js';
import { codexPlanOf } from '../plan.js';
import type { CodexPlan, CodexUsage } from '../types.js';
import { dateRange, forEachLine, incr, listFilesRecursive, modelKey, runPool, type Progress } from './lines.js';

const ITEM_COMPLETED_MARK = Buffer.from('"item_completed"');
const SESSION_META_MARK = Buffer.from('"session_meta"');
const TURN_CONTEXT_MARK = Buffer.from('"turn_context"');
/** event_msg token_count: running token totals and the account's rate limits (plan_type). Small lines, ~600 bytes. */
const TOKEN_COUNT_MARK = Buffer.from('"token_count"');
const PATH_DATE_PATTERN = /(?:^|\/)(\d{4})\/(\d{2})\/(\d{2})\//;
const SKILL_FILE_SUFFIX = '/SKILL.md';
const FILE_CONCURRENCY = 8;
const PROGRESS_EVERY_FILES = 100;
/** The built-in agent a spawned subagent runs as when its `agent_role` is null. */
export const CODEX_DEFAULT_ROLE = 'default';
/** session_meta of a non-interactive `codex exec` run. */
const EXEC_SOURCE = 'exec';
const EXEC_ORIGINATOR = 'codex_exec';
/** turn_context without an effort field. */
export const NO_EFFORT = '';

/** Turns (deduped across files) that referenced one SKILL.md path, and the latest time it happened. */
export type SkillRef = { turns: Set<string>; last: string | null };

export type CodexSessionScan = {
  usage: CodexUsage;
  mcpCalls: Map<string, number>;  // server -> calls
  roleCalls: Map<string, number>; // subagent agent_role (null -> 'default') -> spawned rollouts
  days: Set<string>;              // YYYY-MM-DD; for the cross-tool union only, never written to the profile
  skillRefs: Map<string, SkillRef>;              // absolute SKILL.md path -> turns; matched to skills later, never exported
  modelTurns: Map<string, Map<string, number>>;  // turn_context model -> effort (or NO_EFFORT) -> turns, every session kind
  interactiveModelTurns: Map<string, Map<string, number>>; // the same, interactive sessions only
  plan: CodexPlan | null;                        // from the latest token_count with a plan_type, normalized
};

/** The latest non-null `rate_limits.plan_type` seen so far, raw until the scan ends. */
type PlanSeen = { at: number; raw: string };

/** Turn counts per model and effort, with the turn ids already counted. */
type ModelBucket = { turns: Map<string, Map<string, number>>; ids: Set<string> };

type Accumulator = {
  seen: Set<string>;
  metaIds: Set<string>;
  allModels: ModelBucket;
  interactiveModels: ModelBucket;
  mcpCalls: Map<string, number>;
  roleCalls: Map<string, number>;
  skillRefs: Map<string, SkillRef>;
  mcpTotal: number;
  subagent: number;
  subagentFiles: number;
  execFiles: number;
  commands: number;
  outputTokens: number;
  plan: PlanSeen | null;
  badLines: number;
};

/**
 * Per rollout file. Only the first session_meta describes the file: a forked subagent rollout also carries a copy of
 * its parent's session_meta further down.
 */
type FileState = {
  metaSeen: boolean;
  rel: string;
  day: string | null;
  kind: 'interactive' | 'exec' | 'subagent';
  /** Largest total_token_usage.output_tokens in this file; totals only grow within a rollout. */
  maxOutput: number;
};

function addSkillRef(acc: Accumulator, path: string, turn: string, at: string | null): void {
  const ref = acc.skillRefs.get(path) ?? { turns: new Set<string>(), last: null };
  ref.turns.add(turn);
  if (at !== null && (ref.last === null || at > ref.last)) ref.last = at;
  acc.skillRefs.set(path, ref);
}

/** SKILL.md paths named by an item: explicit `$skill` mentions and implicit reads by a command. */
function skillPaths(item: Record<string, unknown>): string[] {
  if (item.type === 'UserMessage' && Array.isArray(item.content)) {
    return item.content
      .filter((c): c is Record<string, unknown> => isRecord(c) && c.type === 'skill' && typeof c.path === 'string')
      .map((c) => c.path as string)
      .filter((p) => isAbsolute(p));
  }
  if (item.type === 'CommandExecution' && Array.isArray(item.parsed_cmd)) {
    const cwd = typeof item.cwd === 'string' && isAbsolute(item.cwd) ? item.cwd : null;
    return item.parsed_cmd
      .filter((c): c is Record<string, unknown> => isRecord(c) && c.type === 'read' && typeof c.path === 'string')
      .map((c) => c.path as string)
      .filter((p) => p.endsWith(SKILL_FILE_SUFFIX) && (isAbsolute(p) || cwd !== null))
      .map((p) => (isAbsolute(p) ? p : resolve(cwd as string, p)));
  }
  return [];
}

function countSkillRefs(acc: Accumulator, file: FileState, record: Record<string, unknown>, item: Record<string, unknown>): void {
  const paths = skillPaths(item);
  if (paths.length === 0) return;
  const payload = record.payload as Record<string, unknown>;
  // One use per skill per turn: reading SKILL.md twice, or $skill plus a read, in the same turn is one use.
  const turn = typeof payload.turn_id === 'string' ? `turn:${payload.turn_id}` : `file:${file.rel}`;
  const at = typeof record.timestamp === 'string' ? record.timestamp : file.day && `${file.day}T00:00:00.000Z`;
  for (const path of paths) addSkillRef(acc, path, turn, at);
}

function countItem(acc: Accumulator, file: FileState, record: unknown): void {
  if (!isRecord(record) || record.type !== 'event_msg' || !isRecord(record.payload)) return;
  const { payload } = record;
  if (payload.type !== 'item_completed' || !isRecord(payload.item)) return;
  const { item } = payload;
  countSkillRefs(acc, file, record, item);
  const type = item.type;
  if (type !== 'McpToolCall' && type !== 'SubAgentActivity' && type !== 'CommandExecution') return;
  // A subagent reports started / interacted / completed; only the spawn counts.
  if (type === 'SubAgentActivity' && item.kind !== 'started') return;
  if (typeof item.id === 'string') {
    const key = `${type}:${item.id}`;
    if (acc.seen.has(key)) return;
    acc.seen.add(key);
  }
  if (type === 'McpToolCall') {
    acc.mcpTotal += 1;
    if (typeof item.server === 'string') incr(acc.mcpCalls, item.server);
  } else if (type === 'SubAgentActivity') {
    acc.subagent += 1;
  } else {
    acc.commands += 1;
  }
}

/** `payload.source.subagent.thread_spawn.agent_role`: a string role, null for the default agent, undefined if not spawned. */
function spawnedRole(subagent: unknown): string | null | undefined {
  if (!isRecord(subagent) || !isRecord(subagent.thread_spawn)) return undefined;
  const role = subagent.thread_spawn.agent_role;
  return typeof role === 'string' && role.trim().length > 0 ? role.trim() : null;
}

function readSessionMeta(acc: Accumulator, file: FileState, record: unknown): void {
  if (file.metaSeen || !isRecord(record) || record.type !== 'session_meta' || !isRecord(record.payload)) return;
  file.metaSeen = true;
  const { payload } = record;
  if (payload.source === EXEC_SOURCE || payload.originator === EXEC_ORIGINATOR) {
    file.kind = 'exec';
    acc.execFiles += 1;
    return;
  }
  if (!isRecord(payload.source) || payload.source.subagent === undefined) return;
  file.kind = 'subagent';
  acc.subagentFiles += 1;
  const role = spawnedRole(payload.source.subagent);
  if (role === undefined) return;
  if (typeof payload.id === 'string') {
    if (acc.metaIds.has(payload.id)) return;
    acc.metaIds.add(payload.id);
  }
  incr(acc.roleCalls, role ?? CODEX_DEFAULT_ROLE);
}

function addTurn(bucket: ModelBucket, model: string, effort: string, turnId: unknown): void {
  if (typeof turnId === 'string') {
    if (bucket.ids.has(turnId)) return;
    bucket.ids.add(turnId);
  }
  const efforts = bucket.turns.get(model) ?? new Map<string, number>();
  incr(efforts, effort);
  bucket.turns.set(model, efforts);
}

/**
 * One count per turn. Each bucket dedupes turn_id on its own: a forked subagent rollout repeats its parent's turns,
 * and those copies must not keep the parent's turn out of the interactive bucket.
 */
function readTurnContext(acc: Accumulator, file: FileState, record: unknown): void {
  if (!isRecord(record) || record.type !== 'turn_context' || !isRecord(record.payload)) return;
  const { payload } = record;
  if (typeof payload.model !== 'string' || payload.model.trim().length === 0) return;
  const effort = typeof payload.effort === 'string' && payload.effort.length > 0 ? payload.effort : NO_EFFORT;
  addTurn(acc.allModels, payload.model, effort, payload.turn_id);
  if (file.kind === 'interactive') addTurn(acc.interactiveModels, payload.model, effort, payload.turn_id);
}

function readPlan(acc: Accumulator, record: Record<string, unknown>, rateLimits: unknown): void {
  if (!isRecord(rateLimits) || typeof rateLimits.plan_type !== 'string' || typeof record.timestamp !== 'string') return;
  const at = Date.parse(record.timestamp);
  if (Number.isNaN(at)) return;
  const raw = rateLimits.plan_type;
  // Files are read concurrently; equal times are settled by the string so the result does not depend on read order.
  const prev = acc.plan;
  if (prev === null || at > prev.at || (at === prev.at && compareStrings(raw, prev.raw) > 0)) acc.plan = { at, raw };
}

/** Output tokens (the per-file maximum) and the plan. `info` is null on lines that only report rate limits. */
function readTokenCount(acc: Accumulator, file: FileState, record: unknown): void {
  if (!isRecord(record) || record.type !== 'event_msg' || !isRecord(record.payload)) return;
  const { payload } = record;
  if (payload.type !== 'token_count') return;
  readPlan(acc, record, payload.rate_limits);
  const total = isRecord(payload.info) && isRecord(payload.info.total_token_usage) ? payload.info.total_token_usage.output_tokens : undefined;
  if (typeof total === 'number' && Number.isFinite(total) && total > file.maxOutput) file.maxOutput = total;
}

function scanLine(acc: Accumulator, file: FileState, line: Buffer): void {
  const meta = !file.metaSeen && line.indexOf(SESSION_META_MARK) !== -1;
  const turn = line.indexOf(TURN_CONTEXT_MARK) !== -1;
  const tokens = line.indexOf(TOKEN_COUNT_MARK) !== -1;
  if (!meta && !turn && !tokens && line.indexOf(ITEM_COMPLETED_MARK) === -1) return;
  try {
    const record: unknown = JSON.parse(line.toString('utf8'));
    if (meta) readSessionMeta(acc, file, record);
    if (turn) readTurnContext(acc, file, record);
    if (tokens) readTokenCount(acc, file, record);
    countItem(acc, file, record);
  } catch {
    acc.badLines += 1;
  }
}

/** Turns per model id (validated), from interactive turns, or every turn when there are no interactive ones. */
function modelCounts(acc: Accumulator): Record<string, number> {
  const turns = acc.interactiveModels.turns.size > 0 ? acc.interactiveModels.turns : acc.allModels.turns;
  const counts = new Map<string, number>();
  for (const [model, efforts] of turns) incr(counts, modelKey(model), [...efforts.values()].reduce((a, b) => a + b, 0));
  return Object.fromEntries([...counts].sort((a, b) => compareStrings(a[0], b[0])));
}

function pathDay(rel: string): string | null {
  const m = PATH_DATE_PATTERN.exec(rel);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Aggregates `<codexHome>/sessions/YYYY/MM/DD/*.jsonl`. Activity dates come from the path. */
export async function scanCodexSessions(
  codexHome: string,
  diag: Diagnostics,
  onProgress?: Progress,
): Promise<CodexSessionScan> {
  const sessionsDir = join(codexHome, 'sessions');
  const files = await listFilesRecursive(sessionsDir, '.jsonl');
  const acc: Accumulator = {
    seen: new Set(), metaIds: new Set(), mcpCalls: new Map(), roleCalls: new Map(), skillRefs: new Map(),
    allModels: { turns: new Map(), ids: new Set() }, interactiveModels: { turns: new Map(), ids: new Set() },
    mcpTotal: 0, subagent: 0, subagentFiles: 0, execFiles: 0, commands: 0, outputTokens: 0, plan: null, badLines: 0,
  };
  const days = new Set(files.map(pathDay).filter((d): d is string => d !== null));
  const interactiveDays = new Set<string>();
  let done = 0;
  await runPool(files, FILE_CONCURRENCY, async (rel) => {
    // A file without session_meta counts as interactive, as for `sessions`.
    const file: FileState = { metaSeen: false, rel, day: pathDay(rel), kind: 'interactive', maxOutput: 0 };
    try {
      await forEachLine(join(sessionsDir, rel), (line) => scanLine(acc, file, line));
    } catch (err) {
      diag.warn(join(sessionsDir, rel), `읽기 실패 (${describeError(err)})`);
    }
    // Every rollout (subagent ones too) starts its own totals, so the per-file maxima add up without double counting.
    acc.outputTokens += file.maxOutput;
    if (file.kind === 'interactive' && file.day) interactiveDays.add(file.day);
    done += 1;
    if (onProgress && (done % PROGRESS_EVERY_FILES === 0 || done === files.length)) onProgress(done, files.length);
  });
  if (acc.badLines > 0) diag.warn(sessionsDir, `JSON 파싱 실패 줄 ${acc.badLines}개 건너뜀`);
  return {
    usage: {
      // Interactive sessions only: not subagent rollouts, not `codex exec`. A file without session_meta still counts.
      sessions: files.length - acc.subagentFiles - acc.execFiles,
      execSessions: acc.execFiles,
      mcpCalls: acc.mcpTotal,
      subagentActivities: acc.subagent,
      commandExecutions: acc.commands,
      models: modelCounts(acc),
      outputTokens: acc.outputTokens,
      // Days with a session a person opened; the sheet uses it to pick the main tool (exec runs are often automation).
      interactiveDays: interactiveDays.size,
      ...dateRange(days),
    },
    mcpCalls: acc.mcpCalls,
    roleCalls: acc.roleCalls,
    days,
    skillRefs: acc.skillRefs,
    modelTurns: acc.allModels.turns,
    interactiveModelTurns: acc.interactiveModels.turns,
    plan: codexPlanOf(acc.plan?.raw ?? null),
  };
}
