import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
  assert.deepEqual(x.skills, [
    { name: 'worklog', description: 'Writes a work log to ~/secret/log.md', source: 'user', uses: 0, lastUsedAt: null },
  ]);
  assert.deepEqual(x.commands, [{ name: 'fix', description: 'Fix things' }]);
  assert.equal(x.rulesFiles, 1);
  assert.deepEqual(x.instructions, { present: true, lines: 2, bytes: 21 });
});

test('Codex hooks.json', async () => {
  const x = (await scanFixture({ usage: false })).profile.codex;
  assert.ok(x);
  assert.deepEqual(x.hooks, [{ event: 'Stop', matcher: null, type: 'command', label: 'notify.py' }]);
});

test('Codex sessions: McpToolCall deduped by item.id, per-server calls, dates from path', async () => {
  const { profile } = await scanFixture();
  const x = profile.codex;
  assert.ok(x?.usage);
  assert.deepEqual(x.usage, {
    sessions: 2, mcpCalls: 2, subagentActivities: 1, commandExecutions: 2,
    firstActivity: '2026-10-08', lastActivity: '2026-10-09', activeDays: 2,
  });
  assert.equal(byName(x.mcpServers, 'acme-mcp').calls, 1);
  assert.equal(byName(x.mcpServers, 'web').calls, 1);
  assert.ok(profile.warnings.some((w) => w.startsWith('~/.codex/sessions: JSON 파싱 실패 줄 1개')));
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
    assert.equal(x.model, null);
    assert.deepEqual(x.hooks, []);
    assert.equal(x.skills.length, 1);
    assert.ok(x.usage && x.usage.sessions === 2);
    for (const path of ['~/.claude/settings.json', '~/.claude.json', '~/.codex/config.toml', '~/.codex/hooks.json']) {
      assert.ok(profile.warnings.some((w) => w.startsWith(`${path}: `)), path);
    }
    assert.equal(JSON.stringify(profile.warnings).includes(home), false);
  } finally {
    await cleanup();
  }
});
