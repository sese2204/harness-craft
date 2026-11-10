import assert from 'node:assert/strict';
import { test } from 'node:test';

import { byName, scanFixture } from './helpers.js';

test('Claude transcripts: dedupe by tool_use id, builtin tools, sessions, dates', async () => {
  const { profile } = await scanFixture();
  const u = profile.claudeCode?.usage;
  assert.ok(u);
  // t1..t11 distinct; t1 and t2 appear twice.
  assert.equal(u.toolCalls, 11);
  assert.deepEqual(u.builtinTools, { Bash: 1, Read: 2 });
  assert.equal(u.sessions, 2);
  assert.equal(u.subagentRuns, 1);
  assert.equal(u.projects, 1);
  assert.equal(u.firstActivity, '2026-10-01');
  assert.equal(u.lastActivity, '2026-10-06');
  assert.equal(u.activeDays, 5);
  assert.ok(profile.warnings.some((w) => /JSON 파싱 실패 줄 1개/.test(w)));
});

test('Claude transcripts: MCP calls split by server', async () => {
  const c = (await scanFixture()).profile.claudeCode;
  assert.ok(c);
  assert.equal(byName(c.mcpServers, 'remote').calls, 1);
  assert.equal(byName(c.mcpServers, 'proj-server').calls, 1);
  assert.equal(byName(c.mcpServers, 'leaky-stdio').calls, 0);
});

test('skill uses = max(skillUsage, Skill calls + slash calls)', async () => {
  const c = (await scanFixture()).profile.claudeCode;
  assert.ok(c);
  // alpha: skillUsage 2 vs transcript 2 Skill + 2 slash = 4.
  assert.equal(byName(c.skills, 'alpha').uses, 4);
  assert.equal(byName(c.skills, 'alpha').lastUsedAt, new Date(1790000000000).toISOString());
  // beta: skillUsage 10 vs 1 slash.
  assert.equal(byName(c.skills, 'beta').uses, 10);
  // gamma (plugin): skillUsage 'myplug:gamma' 1 + 'gamma' 2 = 3 vs 1 Skill call.
  assert.equal(byName(c.skills, 'myplug:gamma').uses, 3);
  assert.equal(byName(c.skills, 'myplug:gamma').lastUsedAt, new Date(1790000300000).toISOString());
  assert.equal(byName(c.skills, 'broken').uses, 0);
  assert.equal(byName(c.skills, 'broken').lastUsedAt, null);
});

test('without usage, skill uses fall back to skillUsage only', async () => {
  const c = (await scanFixture({ usage: false })).profile.claudeCode;
  assert.ok(c);
  assert.equal(byName(c.skills, 'alpha').uses, 2);
  assert.equal(byName(c.mcpServers, 'remote').calls, 0);
});

test('agent uses come from Agent and Task subagent_type', async () => {
  const c = (await scanFixture()).profile.claudeCode;
  assert.ok(c);
  assert.equal(byName(c.agents, 'reviewer').uses, 1);
  assert.equal(byName(c.agents, 'myplug:helper').uses, 1);
  assert.equal(byName(c.agents, 'free').uses, 0);
});
