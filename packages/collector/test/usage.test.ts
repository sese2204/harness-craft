import assert from 'node:assert/strict';
import { appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import { collectProfile } from '../src/collect.js';
import { byName, FIXED_NOW, makeHome, scanFixture } from './helpers.js';

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

test('used Claude Code built-in agents are listed as builtin; unused or shadowed ones are not', async () => {
  const { home, cleanup } = await makeHome();
  try {
    const call = (id: string, type: string) => ({ type: 'tool_use', id, name: 'Agent', input: { subagent_type: type } });
    const record = {
      type: 'assistant',
      timestamp: '2026-10-05T02:00:00.000Z',
      message: { content: [call('b1', 'Explore'), call('b2', 'Explore'), call('b3', 'general-purpose')] },
    };
    await appendFile(join(home, '.claude', 'projects', '-Users-fakeuser-proj', 'sess2.jsonl'), `\n${JSON.stringify(record)}\n`);
    // A user agent with a built-in's name takes its calls; the built-in is not listed twice.
    await writeFile(join(home, '.claude', 'agents', 'general-purpose.md'), '---\nname: general-purpose\ndescription: Mine\n---\n');
    const agents = (await collectProfile({ home, usage: true, now: FIXED_NOW })).claudeCode?.agents ?? [];
    assert.deepEqual(byName(agents, 'Explore'), {
      name: 'Explore', description: '', model: null, effort: null, toolCount: null, mcpServers: [], source: 'builtin', uses: 2,
    });
    assert.deepEqual(agents.filter((a) => a.name === 'general-purpose').map((a) => [a.source, a.uses]), [['user', 1]]);
    for (const unused of ['Plan', 'claude', 'statusline-setup', 'claude-code-guide']) {
      assert.equal(agents.some((a) => a.name === unused), false, unused);
    }
  } finally {
    await cleanup();
  }
});

test('no built-in agent is listed for the plain fixture or without usage', async () => {
  for (const usage of [true, false]) {
    const c = (await scanFixture({ usage })).profile.claudeCode;
    assert.ok(c);
    assert.equal(c.agents.some((a) => a.source === 'builtin'), false);
  }
});
