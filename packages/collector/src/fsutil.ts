import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { describeError, type Diagnostics } from './diagnostics.js';

export function isMissing(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if (isMissing(err)) return false;
    throw err;
  }
}

/** Reads a UTF-8 file. Missing -> null silently. Other errors -> warning + null. */
export async function readTextOrNull(path: string, diag: Diagnostics): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if (!isMissing(err)) diag.warn(path, `읽기 실패 (${describeError(err)})`);
    return null;
  }
}

/** Reads and parses a JSON file. Missing -> null silently. Broken -> warning + null. */
export async function readJsonOrNull(path: string, diag: Diagnostics): Promise<unknown> {
  const text = await readTextOrNull(path, diag);
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    diag.warn(path, `JSON ${describeError(err)}`);
    return null;
  }
}

/**
 * Lists names of direct entries of `dir` that satisfy `kind`, following symlinks.
 * Hidden entries (dot-prefixed) are skipped. Missing dir -> [].
 */
export async function listEntries(
  dir: string,
  kind: 'dir' | 'file',
  diag: Diagnostics,
): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if (!isMissing(err)) diag.warn(dir, `목록 읽기 실패 (${describeError(err)})`);
    return [];
  }
  const out: string[] = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    try {
      const s = await stat(join(dir, name));
      if (kind === 'dir' ? s.isDirectory() : s.isFile()) out.push(name);
    } catch (err) {
      if (!isMissing(err)) diag.warn(join(dir, name), `stat 실패 (${describeError(err)})`);
    }
  }
  return out.sort(compareStrings);
}

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortByName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareStrings(a.name, b.name));
}

export function basename(p: string): string {
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] ?? '';
}
