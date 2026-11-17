// Pi skills: package skills, settings `skills[]`, <agent-dir>/skills and ~/.agents/skills (docs/collector-spec.md 「Pi」).
import { readdir, realpath, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ScanContext } from '../context.js';
import { describeError } from '../diagnostics.js';
import { parseFrontmatter, stringField } from '../frontmatter.js';
import { basename, compareStrings, isMissing, readTextOrNull, sortByName } from '../fsutil.js';
import type { Skill, Source } from '../types.js';
import type { SkillRef } from '../usage/codex.js';
import { resolvePiPath, stringList } from './config.js';
import type { PiPackage } from './packages.js';

const MAX_NAME_LENGTH = 120;
const SKILL_FILE = 'SKILL.md';
const MARKDOWN_SUFFIX = '.md';
const SKIPPED_DIR = 'node_modules';
const EXCLUDE_PREFIX = '-';

/**
 * Pi's two discovery modes (package-manager.ts collectSkillEntries): a folder with SKILL.md is one skill and is not
 * descended into; otherwise loose `.md` files count at the root (`pi`: agent dir, settings, packages) or only below it
 * (`agents`: ~/.agents/skills).
 */
type Mode = 'pi' | 'agents';
type Root = { path: string; source: Source; mode: Mode };
type Found = { file: string; name: string; description: string; source: Source };
type Usage = { turns: Set<string>; last: string | null };

export type PiSkillRefs = { paths: ReadonlyMap<string, SkillRef>; names: ReadonlyMap<string, SkillRef> };
export type PiSkills = { skills: Skill[]; pluginUses: Map<string, number> };

/** Directory, file, or null when missing (a broken symlink too). Other stat failures are warned about and skipped. */
async function kindOf(path: string, ctx: ScanContext): Promise<'dir' | 'file' | null> {
  try {
    const s = await stat(path);
    return s.isDirectory() ? 'dir' : s.isFile() ? 'file' : null;
  } catch (err) {
    if (!isMissing(err)) ctx.diag.warn(path, `stat 실패 (${describeError(err)})`);
    return null;
  }
}

async function walk(dir: string, root: string, mode: Mode, ctx: ScanContext): Promise<string[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).sort(compareStrings);
  } catch (err) {
    if (!isMissing(err)) ctx.diag.warn(dir, `목록 읽기 실패 (${describeError(err)})`);
    return [];
  }
  if (names.includes(SKILL_FILE) && (await kindOf(join(dir, SKILL_FILE), ctx)) === 'file') return [join(dir, SKILL_FILE)];
  const out: string[] = [];
  for (const name of names) {
    if (name.startsWith('.') || name === SKIPPED_DIR) continue;
    const path = join(dir, name);
    const kind = await kindOf(path, ctx);
    const loose = name.endsWith(MARKDOWN_SUFFIX) && (mode === 'pi' ? dir === root : dir !== root);
    if (kind === 'file' && loose) out.push(path);
    else if (kind === 'dir') out.push(...(await walk(path, root, mode, ctx)));
  }
  return out;
}

async function discover(root: Root, ctx: ScanContext): Promise<string[]> {
  const kind = await kindOf(root.path, ctx);
  if (kind === 'file') return root.path.endsWith(MARKDOWN_SUFFIX) ? [root.path] : [];
  return kind === 'dir' ? walk(root.path, root.path, root.mode, ctx) : [];
}

/** Pi skips a skill without a description. The name falls back to the folder that holds the file. */
async function readSkill(file: string, source: Source, ctx: ScanContext): Promise<Found | null> {
  const text = await readTextOrNull(file, ctx.diag);
  if (text === null) return null;
  const fm = parseFrontmatter(text);
  if (fm.error && basename(file) === SKILL_FILE) ctx.diag.warn(file, fm.error);
  const description = stringField(fm.data, 'description');
  if (description === null || description.trim().length === 0) return null;
  return { file, name: stringField(fm.data, 'name') || basename(dirname(file)), description, source };
}

/** Same order as Pi's resource loader, where the first skill of a name wins: packages, settings, agent dir, ~/.agents. */
function roots(settings: Record<string, unknown>, packages: readonly PiPackage[], ctx: ScanContext): Root[] {
  const plain = stringList(settings.skills).filter((e) => !['!', '+', '-'].some((p) => e.startsWith(p)) && !e.includes('*'));
  return [
    ...packages.flatMap((p) => p.skillRoots.map((path) => ({ path, source: `plugin:${p.name}` as Source, mode: 'pi' as const }))),
    ...plain.map((e) => ({ path: resolvePiPath(e, ctx.piAgentDir, ctx.home), source: 'user' as const, mode: 'pi' as const })),
    { path: join(ctx.piAgentDir, 'skills'), source: 'user', mode: 'pi' },
    { path: join(ctx.home, '.agents', 'skills'), source: 'user', mode: 'agents' },
  ];
}

/** `-path` entries of settings `skills[]` switch one skill off (the file, or the folder of a SKILL.md). `!glob` is not applied. */
function excluded(settings: Record<string, unknown>, ctx: ScanContext): (file: string) => boolean {
  const paths = new Set(
    stringList(settings.skills)
      .filter((e) => e.startsWith(EXCLUDE_PREFIX))
      .map((e) => resolvePiPath(e.slice(EXCLUDE_PREFIX.length), ctx.piAgentDir, ctx.home)),
  );
  return (file) => paths.has(file) || (basename(file) === SKILL_FILE && paths.has(dirname(file)));
}

async function realOrNull(path: string, failures: { count: number }): Promise<string | null> {
  try {
    return await realpath(path);
  } catch (err) {
    if (!isMissing(err)) failures.count += 1;
    return null;
  }
}

function addUsage(out: Map<string, Usage>, name: string, ref: SkillRef): void {
  const prev = out.get(name) ?? { turns: new Set<string>(), last: null };
  const last = prev.last === null || (ref.last !== null && ref.last > prev.last) ? ref.last : prev.last;
  out.set(name, { turns: new Set([...prev.turns, ...ref.turns]), last });
}

/** Turns per kept skill: by the real path of the file read or named in `/skill:`, else by the `/skill:` name. */
async function usageByName(kept: ReadonlyMap<string, Found>, refs: PiSkillRefs, failures: { count: number }): Promise<Map<string, Usage>> {
  const nameByFile = new Map<string, string>();
  for (const skill of kept.values()) {
    const real = await realOrNull(skill.file, failures);
    if (real !== null && !nameByFile.has(real)) nameByFile.set(real, skill.name);
  }
  const out = new Map<string, Usage>();
  for (const [path, ref] of refs.paths) {
    const real = await realOrNull(path, failures);
    const name = real === null ? undefined : nameByFile.get(real);
    if (name !== undefined) addUsage(out, name, ref); // Otherwise a project skill, another tool's file, or a deleted one.
  }
  for (const [name, ref] of refs.names) if (kept.has(name)) addUsage(out, name, ref);
  return out;
}

/** Skills deduped like Pi: the same file once (symlinks resolved), then the first of each name. `refs` is null without a session scan. */
export async function collectPiSkills(
  settings: Record<string, unknown>,
  packages: readonly PiPackage[],
  refs: PiSkillRefs | null,
  ctx: ScanContext,
): Promise<PiSkills> {
  const isExcluded = excluded(settings, ctx);
  const failures = { count: 0 };
  const kept = new Map<string, Found>();
  const files = new Set<string>();
  for (const root of roots(settings, packages, ctx)) {
    for (const file of await discover(root, ctx)) {
      const real = (await realOrNull(file, failures)) ?? file;
      if (files.has(real) || isExcluded(file)) continue;
      files.add(real);
      const found = await readSkill(file, root.source, ctx);
      if (found && !kept.has(found.name)) kept.set(found.name, found);
    }
  }
  const usage = await usageByName(kept, refs ?? { paths: new Map(), names: new Map() }, failures);
  // Paths come from session logs, so they are not named in the warning.
  if (failures.count > 0) ctx.diag.warn(ctx.piAgentDir, `스킬 경로 ${failures.count}개를 확인하지 못해 사용 횟수에서 뺌`);

  const skills: Skill[] = [];
  const pluginUses = new Map<string, number>();
  for (const { name, description, source } of kept.values()) {
    const u = usage.get(name);
    const uses = u?.turns.size ?? 0;
    const plugin = source.startsWith('plugin:') ? source.slice('plugin:'.length) : null;
    if (plugin !== null) pluginUses.set(plugin, (pluginUses.get(plugin) ?? 0) + uses);
    skills.push({
      // Pi calls skills by their bare name (`/skill:<name>`), package skills included, so no `<plugin>:` prefix.
      name: ctx.redactor.text(name, MAX_NAME_LENGTH),
      description: ctx.redactor.text(description),
      source: plugin === null ? source : `plugin:${ctx.redactor.text(plugin, MAX_NAME_LENGTH)}`,
      uses,
      lastUsedAt: u?.last ?? null,
    });
  }
  return { skills: sortByName(skills), pluginUses };
}
