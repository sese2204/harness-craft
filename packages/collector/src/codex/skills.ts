// Codex skills: user roots, bundled system skills and plugin skills, with usage from session logs (docs/collector-spec.md).
import { realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { ScanContext } from '../context.js';
import { definitionName, qualifiedName, toSkill } from '../definitions.js';
import { isMissing, isRecord, sortByName } from '../fsutil.js';
import { readSkillDefinitions, type RawDefinition } from '../items.js';
import type { Skill, Source } from '../types.js';
import type { SkillRef } from '../usage/codex.js';
import type { CodexPluginInstall } from './plugins.js';

const SYSTEM_SKILLS_DIR = '.system';

/** `shownWhenUsed`: system skills and skills of Codex-shipped plugins appear only with uses ≥ 1. */
type Collected = { def: RawDefinition; source: Source; name: string; shownWhenUsed: boolean };
type Rule = { name: string | null; path: string | null; enabled: boolean };
type Usage = { turns: Set<string>; last: string | null };

export type CodexSkills = { skills: Skill[]; pluginUses: Map<string, number> };

/** Real path, or null when it is gone. Other failures (permissions) are counted for one warning. */
async function realOrNull(path: string, failures: { count: number }): Promise<string | null> {
  try {
    return await realpath(path);
  } catch (err) {
    if (!isMissing(err)) failures.count += 1;
    return null;
  }
}

/** `[skills.bundled] enabled = false` turns off the system skills. */
function bundledEnabled(config: Record<string, unknown>): boolean {
  const skills = isRecord(config.skills) ? config.skills : {};
  return !(isRecord(skills.bundled) && skills.bundled.enabled === false);
}

/** `[[skills.config]]` entries: `name` or `path` (absolute SKILL.md) plus `enabled`. If several match, the last wins. */
function configRules(config: Record<string, unknown>): Rule[] {
  const skills = isRecord(config.skills) ? config.skills : {};
  const entries = Array.isArray(skills.config) ? skills.config : [];
  return entries
    .filter((e): e is Record<string, unknown> => isRecord(e) && typeof e.enabled === 'boolean')
    .map((e) => ({
      name: typeof e.name === 'string' ? e.name : null,
      path: typeof e.path === 'string' ? resolve(e.path) : null,
      enabled: e.enabled as boolean,
    }));
}

async function isDisabled(item: Collected, rules: readonly Rule[], failures: { count: number }): Promise<boolean> {
  if (rules.length === 0) return false;
  const file = item.def.path ?? '';
  const paths = new Set([file, (await realOrNull(file, failures)) ?? file]);
  const bare = definitionName(item.def);
  const match = rules.filter((r) => (r.name !== null && (r.name === bare || r.name === item.name)) || (r.path !== null && paths.has(r.path)));
  return match.length > 0 && match[match.length - 1]?.enabled === false;
}

/** Roots in priority order: user roots first, so a user skill wins over a plugin or system skill of the same name. */
async function gather(config: Record<string, unknown>, plugins: readonly CodexPluginInstall[], ctx: ScanContext): Promise<Collected[]> {
  const roots: Array<readonly [string, Source, boolean]> = [
    [join(ctx.codexHome, 'skills'), 'user', false],
    [join(ctx.home, '.agents', 'skills'), 'user', false],
    ...plugins
      .filter((p) => p.enabled && p.skillsDir !== null)
      .map((p) => [p.skillsDir as string, `plugin:${p.name}` as Source, p.bundled] as const),
    ...(bundledEnabled(config) ? [[join(ctx.codexHome, 'skills', SYSTEM_SKILLS_DIR), 'builtin' as Source, true] as const] : []),
  ];
  const out: Collected[] = [];
  for (const [dir, source, shownWhenUsed] of roots) {
    for (const def of await readSkillDefinitions(dir, ctx.diag)) {
      out.push({ def, source, name: qualifiedName(definitionName(def), source), shownWhenUsed });
    }
  }
  return out;
}

/** Turns per skill name, matched by the real path of the SKILL.md folder (roots are often symlinks). */
async function usageByName(
  items: readonly Collected[],
  refs: ReadonlyMap<string, SkillRef>,
  failures: { count: number },
): Promise<Map<string, Usage>> {
  const nameByDir = new Map<string, string>();
  for (const item of items) {
    const dir = item.def.path ? await realOrNull(dirname(item.def.path), failures) : null;
    if (dir !== null && !nameByDir.has(dir)) nameByDir.set(dir, item.name);
  }
  const out = new Map<string, Usage>();
  for (const [path, ref] of refs) {
    const dir = await realOrNull(dirname(path), failures);
    const name = dir === null ? undefined : nameByDir.get(dir);
    if (name === undefined) continue; // Not a skill Codex loads (another tool's folder, a repo-scoped skill, a deleted one).
    const prev = out.get(name) ?? { turns: new Set<string>(), last: null };
    const last = prev.last === null || (ref.last !== null && ref.last > prev.last) ? ref.last : prev.last;
    out.set(name, { turns: new Set([...prev.turns, ...ref.turns]), last });
  }
  return out;
}

/**
 * Skills deduped by name (first root wins), minus `[[skills.config]]`-disabled ones. System skills appear only when
 * used. `refs` is null without a session scan.
 */
export async function collectCodexSkills(
  config: Record<string, unknown>,
  plugins: readonly CodexPluginInstall[],
  refs: ReadonlyMap<string, SkillRef> | null,
  ctx: ScanContext,
): Promise<CodexSkills> {
  const rules = configRules(config);
  const failures = { count: 0 };
  const enabled: Collected[] = [];
  for (const item of await gather(config, plugins, ctx)) if (!(await isDisabled(item, rules, failures))) enabled.push(item);
  const usage = await usageByName(enabled, refs ?? new Map(), failures);
  // Paths come from session logs, so they are not named in the warning.
  if (failures.count > 0) ctx.diag.warn(ctx.codexHome, `스킬 경로 ${failures.count}개를 확인하지 못해 사용 횟수에서 뺌`);
  const kept = new Map<string, Collected>();
  for (const item of enabled) if (!kept.has(item.name)) kept.set(item.name, item);

  const skills: Skill[] = [];
  const pluginUses = new Map<string, number>();
  for (const { def, source, name, shownWhenUsed } of kept.values()) {
    const u = usage.get(name);
    const uses = u?.turns.size ?? 0;
    if (shownWhenUsed && uses === 0) continue;
    if (source.startsWith('plugin:')) {
      const plugin = source.slice('plugin:'.length);
      pluginUses.set(plugin, (pluginUses.get(plugin) ?? 0) + uses);
    }
    skills.push(toSkill(def, source, { uses, lastUsedAt: u?.last ?? null }, ctx));
  }
  return { skills: sortByName(skills), pluginUses };
}
