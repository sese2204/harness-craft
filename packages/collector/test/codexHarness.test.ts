// Codex skill roots and usage, plugins, hook switches, model from sessions, $CODEX_HOME, AGENTS.override.md.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { mostUsedModel } from '../src/codex/index.js';
import { compareVersions } from '../src/codex/plugins.js';
import { collectProfile } from '../src/collect.js';
import { prepareShareProfile } from '../src/shareProfile.js';
import type { HarnessProfile } from '../src/types.js';
import { byName, FIXED_NOW, makeHome, scanFixture } from './helpers.js';

async function withHome<T>(setup: (home: string) => Promise<void>, run: (home: string) => Promise<T>): Promise<T> {
  const { home, cleanup } = await makeHome();
  try {
    await setup(home);
    return await run(home);
  } finally {
    await cleanup();
  }
}

const scanAt = (home: string, usage = true): Promise<HarnessProfile> => collectProfile({ home, usage, now: FIXED_NOW });

test('skill uses: one per turn, explicit $skill + reads of the same skill in one turn count once, matched by real path', async () => {
  const x = (await scanFixture()).profile.codex;
  assert.ok(x);
  assert.deepEqual(x.skills.map((s) => [s.name, s.source, s.uses, s.lastUsedAt]), [
    // No turn_id on the line: one use for the session file.
    ['agentskill', 'user', 1, '2026-10-09T03:04:01.000Z'],
    // Codex-shipped marketplace: the used skill is listed; gmail's `drafts` and pages' `layout` are not.
    ['gmail:inbox', 'plugin:gmail', 1, '2026-10-09T03:03:02.000Z'],
    // Bundled system skill: listed because it was used. The unused `hidden` system skill is not.
    ['sysused', 'builtin', 1, '2026-10-09T03:02:01.000Z'],
    ['toolkit:kit', 'plugin:toolkit', 2, '2026-10-09T03:03:01.000Z'],
    // T1: $worklog + absolute read + relative read (cwd-resolved) = 1. T2: read through the ~/.agents duplicate = 1.
    ['worklog', 'user', 2, '2026-10-09T03:01:01.000Z'],
  ]);
  // Disabled skill, disabled plugin's skill, a Claude-only skill and a deleted repo skill were read but are not Codex skills.
  const names = JSON.stringify(x.skills);
  for (const gone of ['offskill', 'offkit', 'alpha', 'hidden', 'drafts', 'layout']) assert.equal(names.includes(gone), false, gone);
});

test('[[skills.config]] by path (last rule wins) and [skills.bundled] enabled = false', async () => {
  const x = await withHome(
    async (home) => {
      const path = join(home, '.agents', 'skills', 'agentskill', 'SKILL.md');
      const rules = `\n[skills.bundled]\nenabled = false\n\n[[skills.config]]\npath = ${JSON.stringify(path)}\nenabled = true\n\n[[skills.config]]\npath = ${JSON.stringify(path)}\nenabled = false\n`;
      await appendFile(join(home, '.codex', 'config.toml'), rules);
    },
    async (home) => (await scanAt(home)).codex,
  );
  assert.deepEqual(x?.skills.map((s) => s.name), ['gmail:inbox', 'toolkit:kit', 'worklog']);
});

test('plugins: newest version by number, disabled ones listed with 0 uses, uses = sum of plugin skill uses', async () => {
  const x = (await scanFixture()).profile.codex;
  assert.ok(x);
  assert.deepEqual(x.plugins, [
    // openai-* marketplace plugins are listed only when used: gmail yes, pages no.
    { name: 'gmail', marketplace: 'openai-curated-remote', version: '1.2.7', enabled: true, uses: 1 },
    { name: 'offplug', marketplace: 'mkt', version: '0.1.0', enabled: false, uses: 0 },
    { name: 'toolkit', marketplace: 'mkt', version: '1.10.0', enabled: true, uses: 2 },
  ]);
  assert.equal(compareVersions('1.10.0', '1.9.0') > 0, true);
  assert.equal(compareVersions('0.1.0', '0.1.0'), 0);
});

test('[plugins._default] enabled = false applies unless a plugin entry says otherwise', async () => {
  const x = await withHome(
    async (home) => {
      await writeFile(join(home, '.codex', 'config.toml'), '[plugins._default]\nenabled = false\n\n[plugins."offplug@mkt"]\nenabled = true\n');
    },
    async (home) => (await scanAt(home, false)).codex,
  );
  assert.deepEqual(x?.plugins?.map((p) => [p.name, p.enabled]), [['offplug', true], ['toolkit', false]]);
  assert.deepEqual(x?.skills.map((s) => s.name), ['agentskill', 'offplug:offkit', 'offskill', 'worklog']);
  // A new config.toml has no hooks.state, so the handler it disabled is back.
  assert.deepEqual(x?.hooks.map((h) => h.label), ['disabled-by-state.sh', 'notify.py', 'off-plugin-hook.sh']);
});

test('Codex-shipped (openai-*) plugins and their skills stay out without usage; user marketplaces do not', async () => {
  const x = (await scanFixture({ usage: false })).profile.codex;
  assert.deepEqual(x?.plugins?.map((p) => p.name), ['offplug', 'toolkit']);
  assert.equal(x?.skills.some((s) => s.source.startsWith('plugin:gmail') || s.source === 'plugin:pages'), false);
  assert.ok(x?.skills.some((s) => s.name === 'toolkit:kit' && s.uses === 0));
});

test('a hidden plugin takes its Codex skills with it in the shared file', async () => {
  const { profile } = await scanFixture();
  const { profile: out, hidden } = prepareShareProfile(profile, { hide: ['toolkit'], descriptions: false });
  assert.deepEqual(out.codex?.plugins?.map((p) => p.name), ['gmail', 'offplug']);
  assert.equal(out.codex?.skills.some((s) => s.source === 'plugin:toolkit'), false);
  assert.equal(hidden, 2);
});

test('disabled MCP servers are left out', async () => {
  const x = (await scanFixture({ usage: false })).profile.codex;
  assert.deepEqual(x?.mcpServers.map((s) => s.name), ['acme-mcp', 'web']);
});

test('[features] hooks = false (or the old codex_hooks = false) turns every Codex hook off', async () => {
  for (const flag of ['hooks = false', 'codex_hooks = false']) {
    const x = await withHome(
      async (home) => writeFile(join(home, '.codex', 'config.toml'), `[features]\n${flag}\n`),
      async (home) => (await scanAt(home, false)).codex,
    );
    assert.deepEqual(x?.hooks, [], flag);
  }
});

test('model: the most used turn_context model and its effort beat config.toml; config is the fallback', async () => {
  const withUsage = (await scanFixture()).profile.codex;
  assert.equal(withUsage?.model, 'gpt-5.5-sol');
  assert.equal(withUsage?.reasoningEffort, 'high');
  const withoutUsage = (await scanFixture({ usage: false })).profile.codex;
  assert.equal(withoutUsage?.model, 'gpt-test');
  assert.equal(withoutUsage?.reasoningEffort, 'high');
  const ties = new Map([['b-model', new Map([['low', 1]])], ['a-model', new Map([['', 1]])]]);
  assert.deepEqual(mostUsedModel(ties), { model: 'a-model', effort: null });
  assert.equal(mostUsedModel(new Map()), null);
});

test('model: interactive turns first; exec and subagent turns only when there are none; then config', async () => {
  // Interactive: sol ×3 (high, xhigh, high), luna ×1. Exec gpt-exec-model ×5 and subagent ×4 have more turns but do not count.
  // The subagent rollout also repeats the parent's interactive turn T1, which must not hide it from the interactive count.
  assert.equal((await scanFixture()).profile.codex?.model, 'gpt-5.5-sol');
  const fallback = await withHome(
    async (home) => rm(join(home, '.codex', 'sessions', '2026', '10', '09', 'rollout-skills.jsonl')),
    async (home) => (await scanAt(home)).codex,
  );
  assert.equal(fallback?.model, 'gpt-exec-model');
  assert.equal(fallback?.reasoningEffort, 'low');
  const config = await withHome(
    async (home) => rm(join(home, '.codex', 'sessions'), { recursive: true }),
    async (home) => (await scanAt(home)).codex,
  );
  assert.deepEqual([config?.model, config?.reasoningEffort], ['gpt-test', 'high']);
});

test('AGENTS.override.md wins when it has content; an empty one falls back to AGENTS.md', async () => {
  const lines = async (content: string): Promise<number | undefined> =>
    withHome(
      async (home) => writeFile(join(home, '.codex', 'AGENTS.override.md'), content),
      async (home) => (await scanAt(home, false)).codex?.instructions.lines,
    );
  assert.equal(await lines('one\ntwo\nthree\n'), 3);
  assert.equal(await lines(''), 2);
});

test('collectProfile reads Codex from an injected codexHome, never from the environment', async () => {
  await withHome(
    async (home) => rename(join(home, '.codex'), join(home, 'alt-codex')),
    async (home) => {
      assert.equal((await scanAt(home, false)).codex, null, 'default is <home>/.codex');
      const profile = await collectProfile({ home, codexHome: join(home, 'alt-codex'), usage: true, now: FIXED_NOW });
      assert.equal(profile.codex?.usage?.sessions, 3);
      // ~/.agents/skills stays under the home directory, not under CODEX_HOME.
      assert.ok(profile.codex?.skills.some((s) => s.name === 'agentskill'));
      // hooks.state keys name the original ~/.codex path, so the moved hooks.json handler is no longer disabled.
      assert.ok(profile.codex?.hooks.some((h) => h.label === 'disabled-by-state.sh'));
    },
  );
});

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const TSX = import.meta.resolve('tsx');

test('the CLI honors $CODEX_HOME, and --home overrides it', async () => {
  await withHome(
    async (home) => rename(join(home, '.codex'), join(home, 'alt-codex')),
    async (home) => {
      const env = { ...process.env, HOME: home, CODEX_HOME: join(home, 'alt-codex') };
      const run = (args: string[]) => spawnSync(process.execPath, ['--import', TSX, CLI, 'scan', '--json', '--no-usage', ...args], { cwd: home, env, encoding: 'utf8' });
      const viaEnv = run([]);
      assert.equal(viaEnv.status, 0, viaEnv.stderr);
      assert.equal((JSON.parse(viaEnv.stdout) as HarnessProfile).codex?.model, 'gpt-test');
      const viaHome = run(['--home', home]);
      assert.equal(viaHome.status, 0, viaHome.stderr);
      assert.equal((JSON.parse(viaHome.stdout) as HarnessProfile).codex, null);
    },
  );
});

test('no path from session logs or plugin manifests reaches the profile', async () => {
  const { profile, home } = await scanFixture();
  const json = JSON.stringify(profile);
  for (const marker of [home, 'LEAK-']) assert.equal(json.includes(marker), false, marker);
  // Warnings may name files (~/.claude/skills/broken/SKILL.md); the Codex data itself must not.
  const codex = JSON.stringify(profile.codex);
  for (const marker of ['SKILL.md', 'plugins/cache', '.app.json', '__HOME__']) assert.equal(codex.includes(marker), false, marker);
  assert.equal(byName(profile.codex?.plugins ?? [], 'toolkit').version, '1.10.0');
});
