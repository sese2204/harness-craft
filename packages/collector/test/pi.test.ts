// Pi: agent-dir config, session usage (forks, codemode nestedCalls, /skill blocks, SKILL.md reads), env overrides, share.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { collectProfile } from '../src/collect.js';
import { prepareShareProfile } from '../src/shareProfile.js';
import { formatSummary } from '../src/summary.js';
import type { HarnessProfile } from '../src/types.js';
import { byName, FIXED_NOW, makeHome, scanFixture } from './helpers.js';

const PI_LEAKS = [
  'LEAK-PI-AUTH', 'LEAK-PI-MCP-AUTH', 'LEAK-PI-MODELS', 'LEAK-provider', 'LEAK-PI-ENV', 'LEAK-PI-ARG', 'LEAK-PI-HEADER', 'LEAK-docs',
  'LEAK-PI-MCP-DESC', 'LEAK-proxy', 'LEAK-PI-SKILL-BODY', 'LEAK-PI-USER-PROMPT', 'LEAK-PI-CMD', 'LEAK-PI-Q', 'LEAK-PI-OUTPUT',
  'LEAK-PI-TASK', 'LEAK-PI-WRITE', 'LEAK-custom', 'LEAK-PI-SYSTEM', 'LEAK-PI-THINKING', 'LEAK-PI-AGENTSMD', 'LEAK-PI-PROMPT-BODY',
  'LEAK-PI-PLAIN-PROMPT', 'LEAK-moved', 'LEAK-PI-BROKEN', 'LEAK-PI-ERR', 'LEAK-PI-SECOND',
];

async function withPiHome<T>(setup: (home: string) => Promise<void>, run: (home: string) => Promise<T>): Promise<T> {
  const { home, cleanup } = await makeHome({ pi: true });
  try {
    await setup(home);
    return await run(home);
  } finally {
    await cleanup();
  }
}

test('Pi config: MCP from mcp.json (disabled left out), packages and extensions as plugins, prompts, AGENTS.md', async () => {
  const p = (await scanFixture({ pi: true, usage: false })).profile.pi;
  assert.ok(p);
  assert.equal(p.model, 'claude-fixture-default', 'settings defaultModel without a session scan');
  assert.deepEqual(p.mcpServers, [
    { name: 'dev-radius', transport: 'stdio', scope: 'user', command: 'npx', package: '@fixture/radius-mcp', calls: 0 },
    // Not an allow-listed public host, so no host.
    { name: 'docs', transport: 'http', scope: 'user', calls: 0 },
    { name: 'github', transport: 'http', scope: 'user', host: 'api.githubcopilot.com', calls: 0 },
  ]);
  assert.deepEqual(p.plugins.map((x) => [x.name, x.marketplace, x.version]), [
    ['@fixture/not-installed', 'npm', null],
    ['@fixture/pi-tools', 'npm', '1.2.0'],
    // ~/pi-ext/guard.ts from settings `extensions`; builtin:* and -builtin:* entries are not listed.
    ['guard', 'local', null],
    ['local-pack', 'local', null],
    ['notify', 'local', null],
    ['pi-kit', 'git', '0.3.0'],
  ]);
  assert.deepEqual(p.commands, [{ name: 'plain', description: '' }, { name: 'review', description: 'Review staged changes' }]);
  assert.deepEqual(p.instructions, { present: true, lines: 3, bytes: 36 });
  assert.equal(p.usage, null);
});

test('Pi skills: packages, settings paths, agent dir (recursive, loose .md), ~/.agents; -path and no-description skills left out', async () => {
  const p = (await scanFixture({ pi: true, usage: false })).profile.pi;
  assert.deepEqual(p?.skills.map((s) => [s.name, s.source]), [
    ['agentskill', 'user'],
    ['extra', 'user'],
    ['kit-skill', 'plugin:pi-kit'],
    ['loose-skill', 'user'],
    ['pdf', 'plugin:@fixture/pi-tools'],
    ['pi-alpha', 'user'],
    ['pi-beta', 'user'],
    ['worklog', 'user'],
  ]);
});

test('Pi usage: forked copies counted once, codemode nestedCalls, direct MCP, subagent tasks, models, days', async () => {
  const p = (await scanFixture({ pi: true })).profile.pi;
  assert.ok(p?.usage);
  // Parent 11 calls (3 nested) + 3 new in the fork. The fork's copy of turn 1 (3 calls + 3 nested) is not counted again.
  assert.deepEqual(p.usage, {
    sessions: 3,
    toolCalls: 14,
    builtinTools: { bash: 1, codemode: 1, edit: 1, find: 1, grep: 1, read: 4, write: 1 },
    mcpCalls: 3,
    subagentRuns: 2,
    // The copied assistant message is one message; an id with spaces and slashes goes under `other`.
    models: { 'claude-opus-5-5': 3, 'claude-sonnet-5-5': 1, other: 1 },
    // usage.output 1 on each of the five messages; the copy is not counted again.
    outputTokens: 5,
    firstActivity: '2026-10-09',
    lastActivity: '2026-10-13',
    activeDays: 3,
  });
  assert.equal(p.model, 'claude-opus-5-5', 'the most used model beats the configured default');
  // mcp__dev_radius__* (codemode) maps back to the `dev-radius` server; the direct mcp__github__ call to github.
  assert.deepEqual(p.mcpServers.map((s) => [s.name, s.calls]), [['dev-radius', 2], ['docs', 0], ['github', 1]]);
});

test('Pi skill uses: one per skill per turn, by /skill block, read (absolute, @~/, cwd-relative, nested) or block name', async () => {
  const p = (await scanFixture({ pi: true })).profile.pi;
  assert.ok(p);
  const uses = (name: string) => [byName(p.skills, name).uses, byName(p.skills, name).lastUsedAt];
  // Turn 1: /skill:pi-alpha + a read of the same file = 1. Turn 2: read through `@~/` = 1. The fork's copy of turn 1 adds none.
  assert.deepEqual(uses('pi-alpha'), [2, '2026-10-09T02:00:01.000Z']);
  // A relative read inside a codemode script, resolved against the session cwd.
  assert.deepEqual(uses('worklog'), [1, '2026-10-09T01:00:03.000Z']);
  assert.deepEqual(uses('pdf'), [1, '2026-10-09T02:00:01.000Z']);
  // The /skill location no longer exists, so the block name is used.
  assert.deepEqual(uses('pi-beta'), [1, '2026-10-12T03:00:01.000Z']);
  // The system prompt lists skills with their location; that is not a use.
  assert.equal(byName(p.skills, 'loose-skill').uses, 0);
  assert.deepEqual(p.plugins.map((x) => [x.name, x.uses]).filter(([, n]) => n !== 0), [['@fixture/pi-tools', 1]]);
});

test('activity unions Pi days with Claude Code and Codex', async () => {
  assert.deepEqual((await scanFixture({ pi: true })).profile.activity, { firstActivity: '2026-10-01', lastActivity: '2026-10-13', activeDays: 9 });
});

test('auth.json, mcp-auth.json and models.json are never opened', async () => {
  await withPiHome(
    async (home) => {
      for (const file of ['auth.json', 'mcp-auth.json', 'models.json']) await chmod(join(home, '.pi', 'agent', file), 0o000);
    },
    async (home) => {
      const profile = await collectProfile({ home, usage: true, now: FIXED_NOW });
      // An attempt to read an unreadable file would leave an EACCES warning.
      assert.equal(profile.warnings.some((w) => /auth|models\.json|EACCES/.test(w)), false, profile.warnings.join('\n'));
      assert.ok(profile.pi);
    },
  );
});

test('no Pi secret, prompt, path or session text reaches the profile or the shared copy', async () => {
  const { profile, home } = await scanFixture({ pi: true });
  const shared = prepareShareProfile(profile, { hide: [], descriptions: true }).profile;
  for (const json of [JSON.stringify(profile), JSON.stringify(shared)]) {
    for (const marker of [...PI_LEAKS, 'fakeuser', home]) assert.equal(json.includes(marker), false, `marker leaked: ${marker}`);
  }
  // Warnings may name files (~/.pi/agent/sessions); the Pi data itself must not.
  const pi = JSON.stringify(profile.pi);
  for (const marker of ['SKILL.md', '.pi/agent', 'node_modules', '--Users-', '__HOME__']) assert.equal(pi.includes(marker), false, marker);
});

test('no Pi agent dir gives pi: null; an empty one still gives a source', async () => {
  assert.equal((await scanFixture()).profile.pi, null);
  await withPiHome(
    async (home) => {
      await rm(join(home, '.pi', 'agent'), { recursive: true });
      await mkdir(join(home, '.pi', 'agent'));
    },
    async (home) => {
      const p = (await collectProfile({ home, usage: true, now: FIXED_NOW })).pi;
      assert.deepEqual([p?.model, p?.skills.map((s) => s.name), p?.usage?.sessions], [null, ['agentskill', 'worklog'], 0]);
    },
  );
});

test('collectProfile reads Pi from an injected agent dir and session dir, never from the environment', async () => {
  await withPiHome(
    async (home) => {
      await rename(join(home, '.pi', 'agent'), join(home, 'alt-pi'));
      await rename(join(home, 'alt-pi', 'sessions'), join(home, 'alt-sessions'));
    },
    async (home) => {
      assert.equal((await collectProfile({ home, usage: false, now: FIXED_NOW })).pi, null, 'default is <home>/.pi/agent');
      const noSessions = await collectProfile({ home, piAgentDir: join(home, 'alt-pi'), usage: true, now: FIXED_NOW });
      assert.equal(noSessions.pi?.usage?.sessions, 0);
      const both = await collectProfile({ home, piAgentDir: join(home, 'alt-pi'), piSessionDir: join(home, 'alt-sessions'), usage: true, now: FIXED_NOW });
      assert.equal(both.pi?.usage?.sessions, 3);
      assert.equal(both.pi?.usage?.toolCalls, 14);
    },
  );
});

test('settings sessionDir (absolute or ~/) is read next to the default folder; a relative one is skipped with a warning', async () => {
  const sessionsWith = (sessionDir: string) =>
    withPiHome(
      async (home) => {
        const agent = join(home, '.pi', 'agent');
        await rename(join(agent, 'sessions', '--Users-fakeuser-other--'), join(home, 'moved'));
        const settings = JSON.parse(await readFile(join(agent, 'settings.json'), 'utf8')) as Record<string, unknown>;
        await writeFile(join(agent, 'settings.json'), JSON.stringify({ ...settings, sessionDir }));
      },
      async (home) => {
        const profile = await collectProfile({ home, usage: true, now: FIXED_NOW });
        return [profile.pi?.usage?.sessions, profile.warnings.some((w) => w.includes('sessionDir'))];
      },
    );
  assert.deepEqual(await sessionsWith('~/moved'), [3, false]);
  assert.deepEqual(await sessionsWith('moved'), [2, true]);
});

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const TSX = import.meta.resolve('tsx');

test('the CLI honors $PI_CODING_AGENT_DIR and $PI_CODING_AGENT_SESSION_DIR, and --home overrides both', async () => {
  await withPiHome(
    async (home) => {
      await rename(join(home, '.pi', 'agent'), join(home, 'alt-pi'));
      await rename(join(home, 'alt-pi', 'sessions'), join(home, 'alt-sessions'));
    },
    async (home) => {
      const { CODEX_HOME: _codex, ...rest } = process.env;
      const env = { ...rest, HOME: home, PI_CODING_AGENT_DIR: '~/alt-pi', PI_CODING_AGENT_SESSION_DIR: join(home, 'alt-sessions') };
      const run = (args: string[]) => spawnSync(process.execPath, ['--import', TSX, CLI, 'scan', '--json', ...args], { cwd: home, env, encoding: 'utf8' });
      const viaEnv = run([]);
      assert.equal(viaEnv.status, 0, viaEnv.stderr);
      const profile = JSON.parse(viaEnv.stdout) as HarnessProfile;
      assert.equal(profile.pi?.usage?.sessions, 3);
      assert.match(viaEnv.stderr, /Pi — 모델 claude-opus-5-5/);
      const viaHome = run(['--home', home, '--no-usage']);
      assert.equal(viaHome.status, 0, viaHome.stderr);
      assert.equal((JSON.parse(viaHome.stdout) as HarnessProfile).pi, null);
    },
  );
});

test('share: Pi items follow --hide, a hidden package takes its skills, descriptions and MCP details are blanked', async () => {
  const { profile } = await scanFixture({ pi: true });
  const { profile: out, hidden } = prepareShareProfile(profile, { hide: ['@fixture/pi-tools', 'dev-*', 'review'], descriptions: false });
  const p = out.pi;
  assert.ok(p);
  assert.equal(p.plugins.some((x) => x.name === '@fixture/pi-tools'), false);
  assert.equal(p.skills.some((s) => s.name === 'pdf'), false);
  assert.deepEqual(p.mcpServers.map((s) => s.name), ['docs', 'github']);
  assert.deepEqual(p.commands.map((c) => c.name), ['plain']);
  // Plugin, its skill, the MCP server and the prompt.
  assert.equal(hidden, 4);
  assert.ok(p.skills.every((s) => s.description === ''));
  assert.equal(p.mcpServers.some((s) => s.host !== undefined), false);
  // A profile written before Pi was collected stays without the key.
  const { pi: _drop, ...old } = profile;
  assert.equal('pi' in prepareShareProfile(old, { hide: [], descriptions: false }).profile, false);
});

test('the summary has a Pi block, and says when Pi was not found', async () => {
  assert.match(formatSummary((await scanFixture({ pi: true })).profile, null), /Pi — 모델 claude-opus-5-5\n {2}MCP 3 · 스킬 8 · 패키지·확장 6 · 프롬프트 2/);
  assert.match(formatSummary((await scanFixture()).profile, null), /Pi — 찾지 못함/);
});
