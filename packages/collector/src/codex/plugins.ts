// Codex plugins: <codexHome>/plugins/cache/<marketplace>/<plugin>/<version>/.codex-plugin/plugin.json (docs/collector-spec.md).
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { ScanContext } from '../context.js';
import { basename, isRecord, listEntries, readJsonOrNull, sortByName } from '../fsutil.js';
import type { Plugin } from '../types.js';

const MAX_FIELD_LENGTH = 120;
const MANIFEST = join('.codex-plugin', 'plugin.json');
const DEFAULT_SKILLS_DIR = 'skills';
const HOOKS_FILE = join('hooks', 'hooks.json');
/** Marketplaces that ship with Codex. Their plugins are treated as built-in: shown only when used. */
const BUNDLED_MARKETPLACE_PREFIX = 'openai-';
/** `[plugins._default]` sets the default for plugins without their own entry. */
const DEFAULT_PLUGIN_KEY = '_default';

/** One installed plugin, newest version only. Paths stay in memory; only Plugin fields are exported. */
export type CodexPluginInstall = {
  name: string;
  marketplace: string;
  version: string | null;
  enabled: boolean;
  /** From a Codex-shipped marketplace (`openai-*`): the user did not pick it, so it and its skills appear only when used. */
  bundled: boolean;
  /** Absolute skills directory inside the plugin, or null when it would point outside the plugin. */
  skillsDir: string | null;
  hooksFile: string;
};

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel.split(sep)[0] !== '..');
}

/** Numeric-aware version order: 0.1.10 > 0.1.9. Non-numeric parts compare as strings. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/);
  const pb = b.split(/[.+-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '';
    const y = pb[i] ?? '';
    const nx = /^\d+$/.test(x) ? Number(x) : NaN;
    const ny = /^\d+$/.test(y) ? Number(y) : NaN;
    const diff = Number.isNaN(nx) || Number.isNaN(ny) ? (x < y ? -1 : x > y ? 1 : 0) : nx - ny;
    if (diff !== 0) return diff;
  }
  return 0;
}

/** `[plugins."<name>@<marketplace>"].enabled`, else `[plugins._default].enabled`, else enabled. */
function isEnabled(config: Record<string, unknown>, key: string): boolean {
  const plugins = isRecord(config.plugins) ? config.plugins : {};
  for (const entry of [plugins[key], plugins[DEFAULT_PLUGIN_KEY]]) {
    if (isRecord(entry) && typeof entry.enabled === 'boolean') return entry.enabled;
  }
  return true;
}

async function readInstall(
  marketplace: string,
  dir: string,
  config: Record<string, unknown>,
  ctx: ScanContext,
): Promise<CodexPluginInstall | null> {
  // Dot entries (install staging, temp dirs) are skipped by listEntries.
  const versions = (await listEntries(dir, 'dir', ctx.diag)).sort(compareVersions);
  const newest = versions[versions.length - 1];
  if (newest === undefined) return null;
  const root = join(dir, newest);
  const manifest = await readJsonOrNull(join(root, MANIFEST), ctx.diag);
  if (manifest === null) return null;
  const data = isRecord(manifest) ? manifest : {};
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : basename(dir);
  const skillsDir = resolve(root, typeof data.skills === 'string' ? data.skills : DEFAULT_SKILLS_DIR);
  if (!isInside(root, skillsDir)) ctx.diag.warn(join(root, MANIFEST), 'skills 경로가 플러그인 밖이라 읽지 않음');
  return {
    name,
    marketplace,
    version: typeof data.version === 'string' ? data.version : newest,
    enabled: isEnabled(config, `${name}@${marketplace}`),
    bundled: marketplace.startsWith(BUNDLED_MARKETPLACE_PREFIX),
    skillsDir: isInside(root, skillsDir) ? skillsDir : null,
    hooksFile: join(root, HOOKS_FILE),
  };
}

export async function readCodexPlugins(config: Record<string, unknown>, ctx: ScanContext): Promise<CodexPluginInstall[]> {
  const cache = join(ctx.codexHome, 'plugins', 'cache');
  const out: CodexPluginInstall[] = [];
  for (const marketplace of await listEntries(cache, 'dir', ctx.diag)) {
    for (const plugin of await listEntries(join(cache, marketplace), 'dir', ctx.diag)) {
      const install = await readInstall(marketplace, join(cache, marketplace, plugin), config, ctx);
      if (install) out.push(install);
    }
  }
  return out;
}

/** uses = sum of the plugin's skill uses (keyed by plugin name). Disabled plugins are listed with 0; bundled ones only when used. */
export function toCodexPlugins(installs: readonly CodexPluginInstall[], skillUses: ReadonlyMap<string, number>, ctx: ScanContext): Plugin[] {
  const used = (p: CodexPluginInstall): number => (p.enabled ? (skillUses.get(p.name) ?? 0) : 0);
  return sortByName(
    installs.filter((p) => !p.bundled || used(p) > 0).map((p) => ({
      name: ctx.redactor.text(p.name, MAX_FIELD_LENGTH),
      marketplace: ctx.redactor.text(p.marketplace, MAX_FIELD_LENGTH),
      version: ctx.redactor.optional(p.version, MAX_FIELD_LENGTH),
      enabled: p.enabled,
      uses: used(p),
    })),
  );
}
