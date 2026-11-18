import { cp, mkdtemp, mkdir, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectProfile } from '../src/collect.js';
import type { HarnessProfile } from '../src/types.js';
import { FAKE_GHP, FAKE_SK, FIXTURE_PLACEHOLDERS } from './fakeTokens.js';

export const FIXTURE_HOME = fileURLToPath(new URL('./fixtures/home/', import.meta.url));
/** Strings planted in the fixture home that must never reach any output (profile JSON, shared HTML). */
export const LEAK_MARKERS: readonly string[] = [
  'LEAK-',
  'sk-test',
  'ghp_',
  '/Users/fakeuser',
  'fakeuser',
  'fake.user@example.com',
  'Bearer',
  'harness-craft-test-',
  'deadbeefdeadbeef',
  '__FAKE_',
  // ~/.claude.json oauthAccount fields other than organizationType / planDisplayName.
  'Oauthfull',
  'Personname',
  'Oauthdisplay',
  'Oauthorg',
  FAKE_GHP,
  FAKE_SK,
];
export const FIXED_NOW = () => new Date('2026-11-09T00:00:00.000Z');

/** Stands for the temp home's absolute path in fixtures (session logs and hooks.state keys hold absolute paths). */
export const HOME_PLACEHOLDER = '__HOME__';

/** Replaces `__FAKE_*__` placeholders with runtime-assembled tokens and `__HOME__` with the temp home. */
async function fillPlaceholders(dir: string, home: string): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await fillPlaceholders(path, home);
      continue;
    }
    if (!entry.isFile()) continue;
    const text = await readFile(path, 'utf8');
    const filled = Object.entries({ ...FIXTURE_PLACEHOLDERS, [HOME_PLACEHOLDER]: home }).reduce((t, [k, v]) => t.replaceAll(k, v), text);
    if (filled !== text) await writeFile(path, filled);
  }
}

/** Where the fixture keeps Pi's npm installs; `node_modules/` is gitignored, so makeHome renames it into place. */
const PI_NPM_FIXTURE_DIR = 'modules';

export type FixtureOptions = { codex?: boolean; pi?: boolean };

/**
 * Copies the fixture home to a temp dir, fills token placeholders, symlinks ~/.claude/skills -> ../harness/skills and writes
 * installed_plugins.json with the absolute install path (which cannot be static). ~/.pi is opt-in (`pi: true`) so the
 * Claude/Codex expectations stay as they were before Pi was collected.
 */
export async function makeHome(options: FixtureOptions = {}): Promise<{ home: string; cleanup: () => Promise<void> }> {
  const home = await mkdtemp(join(tmpdir(), 'harness-craft-test-'));
  await cp(FIXTURE_HOME, home, { recursive: true });
  await fillPlaceholders(home, home);
  if (options.codex === false) await rm(join(home, '.codex'), { recursive: true, force: true });
  const piNpm = join(home, '.pi', 'agent', 'npm');
  if (options.pi === true) await rename(join(piNpm, PI_NPM_FIXTURE_DIR), join(piNpm, 'node_modules'));
  else await rm(join(home, '.pi'), { recursive: true, force: true });
  await symlink(join('..', 'harness', 'skills'), join(home, '.claude', 'skills'));
  const installPath = join(home, '.claude', 'plugins', 'cache', 'market', 'myplug', '1.0.0');
  await mkdir(join(home, '.claude', 'plugins'), { recursive: true });
  await writeFile(
    join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'myplug@market': [{ scope: 'user', installPath, version: '1.0.0', gitCommitSha: 'a'.repeat(40) }],
        'other@market': [{ scope: 'user', installPath: join(home, 'missing-plugin'), version: '0.1.0' }],
      },
    }),
  );
  return { home, cleanup: () => rm(home, { recursive: true, force: true }) };
}

export async function scanFixture(options: FixtureOptions & { usage?: boolean } = {}): Promise<{ profile: HarnessProfile; home: string }> {
  const { home, cleanup } = await makeHome(options);
  try {
    const profile = await collectProfile({ home, usage: options.usage ?? true, now: FIXED_NOW });
    return { profile, home };
  } finally {
    await cleanup();
  }
}

export function byName<T extends { name: string }>(items: readonly T[], name: string): T {
  const found = items.find((i) => i.name === name);
  if (!found) throw new Error(`no item named ${name} in [${items.map((i) => i.name).join(', ')}]`);
  return found;
}
