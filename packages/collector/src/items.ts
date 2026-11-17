import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { describeError, type Diagnostics } from './diagnostics.js';
import { parseFrontmatter, stringField } from './frontmatter.js';
import { compareStrings, isMissing, listEntries, readTextOrNull } from './fsutil.js';
import type { Instructions } from './types.js';

/** Frontmatter-derived fields of one markdown definition (skill, agent, command). Unredacted. `path` is never exported. */
export type RawDefinition = { fallbackName: string; data: Record<string, unknown>; path?: string };

async function readDefinition(path: string, fallbackName: string, diag: Diagnostics): Promise<RawDefinition | null> {
  const text = await readTextOrNull(path, diag);
  if (text === null) return null;
  const fm = parseFrontmatter(text);
  if (fm.error) diag.warn(path, fm.error);
  return { fallbackName, data: fm.data, path };
}

/** `<dir>/<name>/SKILL.md` for each direct sub-folder that has one (symlinks followed). */
export async function readSkillDefinitions(dir: string, diag: Diagnostics): Promise<RawDefinition[]> {
  const out: RawDefinition[] = [];
  for (const folder of await listEntries(dir, 'dir', diag)) {
    const def = await readDefinition(join(dir, folder, 'SKILL.md'), folder, diag);
    if (def) out.push(def);
  }
  return out;
}

/** `<dir>/*.md` (non-recursive). */
export async function readFlatDefinitions(dir: string, diag: Diagnostics): Promise<RawDefinition[]> {
  const out: RawDefinition[] = [];
  for (const file of await listEntries(dir, 'file', diag)) {
    if (!file.endsWith('.md')) continue;
    const def = await readDefinition(join(dir, file), file.slice(0, -'.md'.length), diag);
    if (def) out.push(def);
  }
  return out;
}

/** `<dir>/**\/*.md`; nested names are joined with ':' (commands/frontend/test.md -> frontend:test). */
export async function readNestedDefinitions(dir: string, diag: Diagnostics): Promise<RawDefinition[]> {
  const out: RawDefinition[] = [];
  const walk = async (rel: string[]): Promise<void> => {
    const here = join(dir, ...rel);
    for (const sub of await listEntries(here, 'dir', diag)) await walk([...rel, sub]);
    for (const def of await readFlatDefinitions(here, diag)) {
      out.push({ ...def, fallbackName: [...rel, def.fallbackName].join(':') });
    }
  };
  await walk([]);
  return out.sort((a, b) => compareStrings(a.fallbackName, b.fallbackName));
}

/** Size and line count only. The body is read to count lines and then dropped. */
export async function readInstructions(path: string, diag: Diagnostics): Promise<Instructions> {
  const absent: Instructions = { present: false, lines: 0, bytes: 0 };
  try {
    const s = await stat(path);
    if (!s.isFile()) return absent;
  } catch (err) {
    if (!isMissing(err)) diag.warn(path, `stat 실패 (${describeError(err)})`);
    return absent;
  }
  const text = await readTextOrNull(path, diag);
  if (text === null) return absent;
  const newlines = text.split('\n').length - 1;
  const lines = text.length === 0 ? 0 : newlines + (text.endsWith('\n') ? 0 : 1);
  return { present: true, lines, bytes: Buffer.byteLength(text, 'utf8') };
}

/** Number of non-hidden files directly under `dir`. */
export async function countFiles(dir: string, diag: Diagnostics): Promise<number> {
  return (await listEntries(dir, 'file', diag)).length;
}

export { stringField };
