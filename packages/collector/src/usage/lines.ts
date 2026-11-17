import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { compareStrings, isMissing } from '../fsutil.js';

const READ_CHUNK_BYTES = 1 << 20;
const NEWLINE = 0x0a;

/**
 * Streams a file and calls `onLine` with each line as a Buffer (no decoding), so callers can
 * cheaply test for byte markers before paying for toString/JSON.parse.
 */
export async function forEachLine(path: string, onLine: (line: Buffer) => void): Promise<void> {
  const stream = createReadStream(path, { highWaterMark: READ_CHUNK_BYTES });
  let pending: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    let pos = 0;
    let nl = chunk.indexOf(NEWLINE, pos);
    while (nl !== -1) {
      const piece = chunk.subarray(pos, nl);
      onLine(pending.length > 0 ? Buffer.concat([...pending, piece]) : piece);
      pending = [];
      pos = nl + 1;
      nl = chunk.indexOf(NEWLINE, pos);
    }
    if (pos < chunk.length) pending = [...pending, chunk.subarray(pos)];
  }
  if (pending.length > 0) onLine(Buffer.concat(pending));
}

/** Recursively lists files under `root` whose name ends with `suffix`. Paths are relative, sorted. */
export async function listFilesRecursive(root: string, suffix: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (rel: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(join(root, rel), { withFileTypes: true });
    } catch (err) {
      if (rel === '' && isMissing(err)) return;
      throw err;
    }
    for (const e of entries) {
      const child = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(child);
      else if (e.isFile() && e.name.endsWith(suffix)) out.push(child);
    }
  };
  await walk('');
  return out.sort(compareStrings);
}

/** Runs `worker` over `items` with bounded concurrency. Rejects on the first worker failure. */
export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++] as T;
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

export type DateRange = { firstActivity: string | null; lastActivity: string | null; activeDays: number };

export function dateRange(days: ReadonlySet<string>): DateRange {
  const sorted = [...days].sort(compareStrings);
  return {
    firstActivity: sorted[0] ?? null,
    lastActivity: sorted[sorted.length - 1] ?? null,
    activeDays: sorted.length,
  };
}

/** Public model ids only; anything else (a custom deployment name, a path) is counted under OTHER_MODEL. */
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9.\-_]{0,63}$/i;
export const OTHER_MODEL = 'other';

export function modelKey(model: string): string {
  return MODEL_ID_PATTERN.test(model) ? model : OTHER_MODEL;
}

export function incr(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

export type Progress = (done: number, total: number) => void;
