import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { collectProfile } from '../src/collect.js';
import { byName, FIXED_NOW, makeHome, scanFixture } from './helpers.js';

test('Codex config.toml, MCP servers, skills, prompts, rules, AGENTS.md', async () => {
  const x = (await scanFixture({ usage: false })).profile.codex;
  assert.ok(x);
  assert.equal(x.model, 'gpt-test');
  assert.equal(x.reasoningEffort, 'high');
  assert.deepEqual(x.mcpServers, [
    { name: 'acme-mcp', transport: 'stdio', scope: 'user', command: 'acme', calls: 0 },
    { name: 'web', transport: 'http', scope: 'user', host: 'mcp.exa.ai', calls: 0 },
  ]);
  // Without usage: no system skill (shown only when used); offskill disabled; the ~/.codex/skills worklog wins.
  assert.deepEqual(x.skills.map((s) => [s.name, s.source, s.uses]), [
    ['agentskill', 'user', 0], ['toolkit:kit', 'plugin:toolkit', 0], ['worklog', 'user', 0],
  ]);
  assert.equal(byName(x.skills, 'worklog').description, 'Writes a work log to ~/secret/log.md');
  assert.deepEqual(x.commands, [{ name: 'fix', description: 'Fix things' }]);
  assert.equal(x.rulesFiles, 1);
  assert.deepEqual(x.instructions, { present: true, lines: 2, bytes: 21 });
});

test('Codex hooks: hooks.json minus state-disabled handlers, inline [hooks] in config.toml, enabled plugin hooks', async () => {
  const x = (await scanFixture({ usage: false })).profile.codex;
  assert.ok(x);
  assert.deepEqual(x.hooks, [
    { event: 'PostToolUse', matcher: null, type: 'command', label: 'kit-hook.js' },
    { event: 'PostToolUse', matcher: 'Bash', type: 'command', label: 'inline-guard.sh' },
    { event: 'Stop', matcher: null, type: 'command', label: 'notify.py' },
  ]);
});

test('Codex sessions: McpToolCall deduped by item.id, per-server calls, dates from path, subagent rollouts are not sessions', async () => {
  const { profile } = await scanFixture();
  const x = profile.codex;
  assert.ok(x?.usage);
  // 9 rollout files: 5 subagent rollouts, 1 `codex exec`, 3 interactive (one without session_meta).
  // subagentActivities counts only `started` (s1, deduped across files).
  assert.deepEqual(x.usage, {
    sessions: 3, execSessions: 1, mcpCalls: 2, subagentActivities: 1, commandExecutions: 8,
    firstActivity: '2026-10-08', lastActivity: '2026-10-09', activeDays: 2,
  });
  assert.equal(byName(x.mcpServers, 'acme-mcp').calls, 1);
  assert.equal(byName(x.mcpServers, 'web').calls, 1);
  assert.ok(profile.warnings.some((w) => w.startsWith('~/.codex/sessions: JSON 파싱 실패 줄 1개')));
});

const CODEX_AGENT_FIELDS = { toolCount: null, mcpServers: [] } as const;

test('Codex agents: standalone files, role tables with config_file, used built-ins only', async () => {
  const { profile } = await scanFixture();
  const agents = profile.codex?.agents;
  assert.ok(agents);
  assert.deepEqual(agents, [
    { name: 'default', description: '', model: null, effort: null, ...CODEX_AGENT_FIELDS, source: 'builtin', uses: 1 },
    { name: 'lostfile', description: 'Role file is missing', model: null, effort: null, ...CODEX_AGENT_FIELDS, source: 'user', uses: 0 },
    { name: 'no-name-field', description: 'Name comes from the file stem', model: null, effort: null, ...CODEX_AGENT_FIELDS, source: 'user', uses: 0 },
    { name: 'outsider', description: 'Role file lives outside the home directory', model: null, effort: null, ...CODEX_AGENT_FIELDS, source: 'user', uses: 0 },
    // The standalone file wins over [agents.planner]; sub-1 appears in two rollouts but counts once.
    { name: 'planner', description: 'Plans work. Key <secret>', model: 'gpt-5.5-sol', effort: 'high', ...CODEX_AGENT_FIELDS, source: 'user', uses: 1 },
    { name: 'reviewer', description: 'Reviews diffs', model: 'gpt-5.5-luna', effort: 'medium', ...CODEX_AGENT_FIELDS, source: 'user', uses: 1 },
  ]);
  // worker/explorer were never spawned; 'deleted-agent' matches nothing and is dropped.
  assert.equal(JSON.stringify(profile).includes('deleted-agent'), false);
  assert.ok(profile.warnings.some((w) => w.startsWith('~/.codex/agents/broken.toml: TOML 파싱 실패')));
  assert.ok(profile.warnings.includes('~/.codex/config.toml: [agents.outsider] config_file 이 ~/.codex 밖을 가리켜 읽지 않음'));
  assert.ok(profile.warnings.some((w) => w.startsWith('~/.codex/config.toml: [agents.lostfile] config_file 을 읽지 못함')));
});

test('Codex agents without usage: defined agents with 0 uses, no built-ins', async () => {
  const agents = (await scanFixture({ usage: false })).profile.codex?.agents;
  assert.ok(agents);
  assert.deepEqual(agents.map((a) => [a.name, a.uses]), [
    ['lostfile', 0], ['no-name-field', 0], ['outsider', 0], ['planner', 0], ['reviewer', 0],
  ]);
});

test('a role config_file that escapes ~/.codex through a symlink is not read', async () => {
  const { home, cleanup } = await makeHome();
  try {
    await mkdir(join(home, 'elsewhere'));
    await writeFile(join(home, 'elsewhere', 'role.toml'), 'model = "LEAK-OUTSIDE-MODEL"\n');
    await symlink(join(home, 'elsewhere', 'role.toml'), join(home, '.codex', 'agents', 'roles', 'linked.toml'));
    await writeFile(join(home, '.codex', 'config.toml'), '[agents.linked]\nconfig_file = "agents/roles/linked.toml"\n');
    const profile = await collectProfile({ home, usage: false, now: FIXED_NOW });
    assert.equal(byName(profile.codex?.agents ?? [], 'linked').model, null);
    assert.ok(profile.warnings.includes('~/.codex/config.toml: [agents.linked] config_file 이 ~/.codex 밖을 가리켜 읽지 않음'));
    assert.equal(JSON.stringify(profile).includes('LEAK-'), false);
  } finally {
    await cleanup();
  }
});

test('developer_instructions and other agent settings never reach the profile', async () => {
  const json = JSON.stringify((await scanFixture()).profile);
  for (const marker of ['LEAK-CODEX-INSTRUCTIONS', 'LEAK-CODEX-ROLE-INSTRUCTIONS', 'LEAK-CODEX-INTERRUPT', 'LEAK-NICK', 'LEAK-PATH', 'outside-LEAK', 'Ada']) {
    assert.equal(json.includes(marker), false, marker);
  }
});

test('activity is the union of Claude and Codex days: a shared day counts once', async () => {
  const home = await mkdtemp(join(tmpdir(), 'harness-craft-union-'));
  try {
    const transcript = join(home, '.claude', 'projects', 'p');
    await mkdir(transcript, { recursive: true });
    const line = (day: string) => JSON.stringify({ type: 'user', timestamp: `${day}T01:00:00.000Z`, message: { content: 'x' } });
    await writeFile(join(transcript, 's.jsonl'), [line('2026-10-01'), line('2026-10-02')].join('\n'));
    for (const day of ['01', '03']) {
      await mkdir(join(home, '.codex', 'sessions', '2026', '10', day), { recursive: true });
      await writeFile(join(home, '.codex', 'sessions', '2026', '10', day, 'r.jsonl'), '');
    }
    const profile = await collectProfile({ home, usage: true, now: FIXED_NOW });
    assert.equal(profile.claudeCode?.usage?.activeDays, 2);
    assert.equal(profile.codex?.usage?.activeDays, 2);
    assert.deepEqual(profile.activity, { firstActivity: '2026-10-01', lastActivity: '2026-10-03', activeDays: 3 });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('activity on the fixture home spans both tools, and is null without usage', async () => {
  assert.deepEqual((await scanFixture()).profile.activity, { firstActivity: '2026-10-01', lastActivity: '2026-10-09', activeDays: 7 });
  assert.equal((await scanFixture({ usage: false })).profile.activity, null);
  assert.deepEqual((await scanFixture({ codex: false })).profile.activity, { firstActivity: '2026-10-01', lastActivity: '2026-10-06', activeDays: 5 });
});

test('missing ~/.codex gives codex: null', async () => {
  const { profile } = await scanFixture({ codex: false });
  assert.equal(profile.codex, null);
  assert.ok(profile.claudeCode);
});

test('empty home gives both sources null', async () => {
  const home = await mkdtemp(join(tmpdir(), 'harness-craft-empty-'));
  try {
    const profile = await collectProfile({ home, usage: true, now: FIXED_NOW });
    assert.equal(profile.claudeCode, null);
    assert.equal(profile.codex, null);
    assert.equal(profile.activity, null);
    assert.deepEqual(profile.warnings, []);
    assert.equal(profile.schemaVersion, 1);
    assert.equal(profile.generatedAt, '2026-11-09T00:00:00.000Z');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('broken files are reported in warnings and the scan continues', async () => {
  const { home, cleanup } = await makeHome();
  try {
    await writeFile(join(home, '.claude', 'settings.json'), '{ "model": ');
    await writeFile(join(home, '.claude.json'), 'not json');
    await writeFile(join(home, '.codex', 'config.toml'), 'model = ');
    await writeFile(join(home, '.codex', 'hooks.json'), '[');
    const profile = await collectProfile({ home, usage: true, now: FIXED_NOW });
    const c = profile.claudeCode;
    const x = profile.codex;
    assert.ok(c && x);
    assert.equal(c.model, null);
    assert.deepEqual(c.hooks, []);
    assert.deepEqual(c.mcpServers, []);
    assert.equal(c.skills.length, 5);
    assert.equal(x.model, 'gpt-5.5-sol', 'the session model does not need config.toml');
    // hooks.json and config.toml are both broken; plugin hooks still load, and without config every plugin is enabled.
    assert.deepEqual(x.hooks.map((h) => h.label), ['kit-hook.js', 'off-plugin-hook.sh']);
    // Broken config.toml: no [[skills.config]] (offskill is back) and no [plugins] (offplug is enabled by default).
    assert.deepEqual(x.skills.map((s) => s.name), ['agentskill', 'gmail:inbox', 'offplug:offkit', 'offskill', 'sysused', 'toolkit:kit', 'worklog']);
    assert.ok(x.usage && x.usage.sessions === 3);
    for (const path of ['~/.claude/settings.json', '~/.claude.json', '~/.codex/config.toml', '~/.codex/hooks.json']) {
      assert.ok(profile.warnings.some((w) => w.startsWith(`${path}: `)), path);
    }
    assert.equal(JSON.stringify(profile.warnings).includes(home), false);
  } finally {
    await cleanup();
  }
});
