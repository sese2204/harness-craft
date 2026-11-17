import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { describeError, type Diagnostics } from '../diagnostics.js';
import { compareStrings, isMissing, isRecord } from '../fsutil.js';
import type { ClaudeUsage } from '../types.js';
import { dateRange, forEachLine, incr, listFilesRecursive, runPool, type Progress } from './lines.js';

const TOOL_USE_MARK = Buffer.from('"tool_use"');
const COMMAND_MARK = Buffer.from('<command-name>');
const TIMESTAMP_MARK = Buffer.from('"timestamp":"');
const DATE_LENGTH = 10;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COMMAND_NAME_PATTERN = /<command-name>\/?([^<\s]+)<\/command-name>/g;
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

function scanLine(acc: Accumulator, line: Buffer): void {
  const ts = line.indexOf(TIMESTAMP_MARK);
  if (ts !== -1) {
    const start = ts + TIMESTAMP_MARK.length;
    const day = line.toString('latin1', start, start + DATE_LENGTH);
    if (DATE_PATTERN.test(day)) acc.days.add(day);
  }
  if (line.indexOf(TOOL_USE_MARK) === -1 && line.indexOf(COMMAND_MARK) === -1) return;
  try {
    countRecord(acc, JSON.parse(line.toString('utf8')));
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
    skillCalls: new Map(), slashCalls: new Map(), agentCalls: new Map(), badLines: 0,
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
      ...dateRange(acc.days),
    },
    mcpCalls: acc.mcpCalls,
    skillCalls: acc.skillCalls,
    slashCalls: acc.slashCalls,
    agentCalls: acc.agentCalls,
    days: acc.days,
  };
}
