// Pi packages (settings `packages[]`) and user extensions as plugins (docs/collector-spec.md 「Pi」).
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

import type { ScanContext } from '../context.js';
import { basename, isRecord, listEntries, pathExists, readJsonOrNull, sortByName } from '../fsutil.js';
import type { Plugin } from '../types.js';
import { resolvePiPath, stringList } from './config.js';

const MAX_FIELD_LENGTH = 120;
const BUILTIN_PREFIX = 'builtin:';
const NPM_PREFIX = 'npm:';
const GIT_PREFIX = 'git:';
const GIT_URL_PATTERN = /^(https?|ssh|git):\/\//i;
/** package-manager.ts parseNpmSpec. */
const NPM_SPEC_PATTERN = /^(@?[^@]+(?:\/[^@]+)?)(?:@(.+))?$/;
const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const EXTENSION_FILE_PATTERN = /\.(?:ts|js|mts|mjs)$/;
const INDEX_FILE_PATTERN = /^index\.(?:ts|js|mts|mjs)$/;
/** Resource keys of the `pi` manifest in package.json; any one of them switches off directory conventions. */
const MANIFEST_KEYS = ['extensions', 'skills', 'prompts', 'themes'] as const;
const OVERRIDE_PREFIXES = ['!', '+', '-'];

export type PiMarketplace = 'npm' | 'git' | 'local';

/** One configured package or extension. Paths stay in memory; only Plugin fields are exported. */
export type PiPackage = {
  name: string;
  marketplace: PiMarketplace;
  version: string | null;
  /** Directories or files to discover skills in. Empty for extensions and for packages filtered to `skills: []`. */
  skillRoots: string[];
};

type Located = { name: string; marketplace: PiMarketplace; root: string | null; specVersion: string | null };

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel.split(sep)[0] !== '..');
}

function locateNpm(spec: string, ctx: ScanContext): Located | null {
  const match = NPM_SPEC_PATTERN.exec(spec);
  const name = match?.[1];
  if (!name) return null;
  const modules = join(ctx.piAgentDir, 'npm', 'node_modules');
  const root = join(modules, name);
  const version = match[2] ?? null;
  return {
    name,
    marketplace: 'npm',
    root: isInside(modules, root) ? root : null,
    specVersion: version !== null && EXACT_VERSION_PATTERN.test(version) ? version : null,
  };
}

/** `git:host/owner/repo@ref`, `https://host/owner/repo.git`, `git@host:owner/repo` -> host + path, ref dropped. */
function locateGit(source: string, ctx: ScanContext): Located | null {
  const url = source.startsWith(GIT_PREFIX) ? source.slice(GIT_PREFIX.length).trim() : source;
  const bare = url.replace(GIT_URL_PATTERN, '').replace(/^[^@/]+@([^:/]+):/, '$1/').replace(/^[^@/]+@/, '');
  const [host = '', ...parts] = bare.replace(/#.*$/, '').split('/').filter(Boolean);
  const last = parts.length > 0 ? parts.pop()!.replace(/@.*$/, '').replace(/\.git$/, '') : '';
  if (host.length === 0 || last.length === 0) return null;
  const gitRoot = join(ctx.piAgentDir, 'git');
  const root = join(gitRoot, host.replace(/:\d+$/, ''), ...parts, last);
  return { name: last, marketplace: 'git', root: isInside(gitRoot, root) ? root : null, specVersion: null };
}

function locateLocal(source: string, ctx: ScanContext): Located {
  const root = resolvePiPath(source, ctx.piAgentDir, ctx.home);
  return { name: basename(root).replace(EXTENSION_FILE_PATTERN, ''), marketplace: 'local', root, specVersion: null };
}

function locate(source: string, ctx: ScanContext): Located | null {
  if (source.startsWith(NPM_PREFIX)) return locateNpm(source.slice(NPM_PREFIX.length).trim(), ctx);
  if (source.startsWith(GIT_PREFIX) || GIT_URL_PATTERN.test(source)) return locateGit(source, ctx);
  return locateLocal(source, ctx);
}

/** Plain manifest paths inside the package; globs and `!`/`+`/`-` filters are not expanded. */
function manifestSkillRoots(root: string, entries: unknown): string[] {
  return stringList(entries)
    .filter((e) => !e.includes('*') && !OVERRIDE_PREFIXES.some((p) => e.startsWith(p)))
    .map((e) => join(root, e))
    .filter((p) => isInside(root, p));
}

/**
 * Where a package keeps its skills: the `pi.skills` manifest entries, or `<root>/skills` without a manifest. A settings
 * entry with `skills: []` loads none; other filters are not applied, so a filtered package may show more skills than Pi loads.
 */
function skillRootsOf(root: string, manifest: Record<string, unknown> | null, filter: Record<string, unknown> | null): string[] {
  if (filter && Array.isArray(filter.skills) && filter.skills.length === 0) return [];
  const pi = manifest && isRecord(manifest.pi) ? manifest.pi : null;
  if (pi && MANIFEST_KEYS.some((k) => pi[k] !== undefined)) return manifestSkillRoots(root, pi.skills);
  return [join(root, 'skills')];
}

async function readPackage(entry: unknown, ctx: ScanContext): Promise<PiPackage | null> {
  const filter = isRecord(entry) ? entry : null;
  const source = typeof entry === 'string' ? entry.trim() : filter && typeof filter.source === 'string' ? filter.source.trim() : '';
  if (source.length === 0 || source.startsWith(BUILTIN_PREFIX)) return null;
  const located = locate(source, ctx);
  if (located === null) return null;
  const { root } = located;
  const installed = root !== null && (await pathExists(root));
  const manifestValue = installed ? await readJsonOrNull(join(root, 'package.json'), ctx.diag) : null;
  const manifest = isRecord(manifestValue) ? manifestValue : null;
  const named = located.marketplace === 'local' && typeof manifest?.name === 'string' && manifest.name.trim() ? manifest.name.trim() : located.name;
  return {
    name: named,
    marketplace: located.marketplace,
    version: typeof manifest?.version === 'string' ? manifest.version : located.specVersion,
    skillRoots: installed ? skillRootsOf(root, manifest, filter) : [],
  };
}

/** `index.ts` names its folder; `foo.ts` is `foo`. */
function extensionName(path: string): string {
  const file = basename(path);
  return INDEX_FILE_PATTERN.test(file) ? basename(dirname(path)) : file.replace(EXTENSION_FILE_PATTERN, '');
}

/** Settings `extensions[]` paths (not `builtin:*`, not filters) and the entries of `<agent-dir>/extensions/`. */
async function readExtensions(settings: Record<string, unknown>, ctx: ScanContext): Promise<PiPackage[]> {
  const listed = stringList(settings.extensions)
    .filter((e) => !e.startsWith(BUILTIN_PREFIX) && !e.includes('*') && !OVERRIDE_PREFIXES.some((p) => e.startsWith(p)))
    .map((e) => extensionName(resolvePiPath(e, ctx.piAgentDir, ctx.home)));
  const dir = join(ctx.piAgentDir, 'extensions');
  const files = (await listEntries(dir, 'file', ctx.diag)).filter((f) => EXTENSION_FILE_PATTERN.test(f)).map((f) => f.replace(EXTENSION_FILE_PATTERN, ''));
  const dirs = (await listEntries(dir, 'dir', ctx.diag)).filter((d) => d !== 'node_modules');
  return [...listed, ...files, ...dirs]
    .filter((name) => name.length > 0)
    .map((name) => ({ name, marketplace: 'local' as const, version: null, skillRoots: [] }));
}

/** Packages first (they own skills), then extensions. The same name from the same kind of source is listed once. */
export async function readPiPackages(settings: Record<string, unknown>, ctx: ScanContext): Promise<PiPackage[]> {
  const entries = Array.isArray(settings.packages) ? (settings.packages as unknown[]) : [];
  const packages: PiPackage[] = [];
  for (const entry of entries) {
    const pkg = await readPackage(entry, ctx);
    if (pkg) packages.push(pkg);
  }
  const seen = new Set<string>();
  return [...packages, ...(await readExtensions(settings, ctx))].filter((p) => {
    const key = `${p.marketplace}\0${p.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** uses = sum of the package's skill uses (keyed by package name). Packages cannot be switched off as a whole. */
export function toPiPlugins(packages: readonly PiPackage[], skillUses: ReadonlyMap<string, number>, ctx: ScanContext): Plugin[] {
  return sortByName(
    packages.map((p) => ({
      name: ctx.redactor.text(p.name, MAX_FIELD_LENGTH),
      marketplace: p.marketplace,
      version: ctx.redactor.optional(p.version, MAX_FIELD_LENGTH),
      enabled: true,
      uses: skillUses.get(p.name) ?? 0,
    })),
  );
}
