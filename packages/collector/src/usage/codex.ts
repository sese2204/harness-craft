import { join } from 'node:path';

import { describeError, type Diagnostics } from '../diagnostics.js';
import { isRecord } from '../fsutil.js';
import type { CodexUsage } from '../types.js';
import { dateRange, forEachLine, incr, listFilesRecursive, runPool, type Progress } from './lines.js';

const ITEM_COMPLETED_MARK = Buffer.from('"item_completed"');
const PATH_DATE_PATTERN = /(?:^|\/)(\d{4})\/(\d{2})\/(\d{2})\//;
const FILE_CONCURRENCY = 8;
const PROGRESS_EVERY_FILES = 100;

export type CodexSessionScan = {
  usage: CodexUsage;
  mcpCalls: Map<string, number>; // server -> calls
};

type Accumulator = {
  seen: Set<string>;
  mcpCalls: Map<string, number>;
  mcpTotal: number;
  subagent: number;
  commands: number;
  badLines: number;
};

function countItem(acc: Accumulator, record: unknown): void {
  if (!isRecord(record) || record.type !== 'event_msg' || !isRecord(record.payload)) return;
  const { payload } = record;
  if (payload.type !== 'item_completed' || !isRecord(payload.item)) return;
  const { item } = payload;
  const type = item.type;
  if (type !== 'McpToolCall' && type !== 'SubAgentActivity' && type !== 'CommandExecution') return;
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

function scanLine(acc: Accumulator, line: Buffer): void {
  if (line.indexOf(ITEM_COMPLETED_MARK) === -1) return;
  try {
    countItem(acc, JSON.parse(line.toString('utf8')));
  } catch {
    acc.badLines += 1;
  }
}

/** Aggregates `<codexDir>/sessions/YYYY/MM/DD/*.jsonl`. Activity dates come from the path. */
export async function scanCodexSessions(
  codexDir: string,
  diag: Diagnostics,
  onProgress?: Progress,
): Promise<CodexSessionScan> {
  const sessionsDir = join(codexDir, 'sessions');
  const files = await listFilesRecursive(sessionsDir, '.jsonl');
  const acc: Accumulator = { seen: new Set(), mcpCalls: new Map(), mcpTotal: 0, subagent: 0, commands: 0, badLines: 0 };
  const days = new Set<string>();
  for (const rel of files) {
    const m = PATH_DATE_PATTERN.exec(rel);
    if (m) days.add(`${m[1]}-${m[2]}-${m[3]}`);
  }
  let done = 0;
  await runPool(files, FILE_CONCURRENCY, async (rel) => {
    try {
      await forEachLine(join(sessionsDir, rel), (line) => scanLine(acc, line));
    } catch (err) {
      diag.warn(join(sessionsDir, rel), `읽기 실패 (${describeError(err)})`);
    }
    done += 1;
    if (onProgress && (done % PROGRESS_EVERY_FILES === 0 || done === files.length)) onProgress(done, files.length);
  });
  if (acc.badLines > 0) diag.warn(sessionsDir, `JSON 파싱 실패 줄 ${acc.badLines}개 건너뜀`);
  return {
    usage: {
      sessions: files.length,
      mcpCalls: acc.mcpTotal,
      subagentActivities: acc.subagent,
      commandExecutions: acc.commands,
      ...dateRange(days),
    },
    mcpCalls: acc.mcpCalls,
  };
}
