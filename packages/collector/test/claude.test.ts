import assert from 'node:assert/strict';
import { test } from 'node:test';

import { byName, scanFixture } from './helpers.js';

test('Claude Code config: model, since, startups, instructions', async () => {
  const c = (await scanFixture({ usage: false })).profile.claudeCode;
  assert.ok(c);
  assert.equal(c.model, 'opus');
  assert.equal(c.since, '2026-01-15T07:23:23.321500Z');
  assert.equal(c.startups, 42);
  assert.deepEqual(c.instructions, { present: true, lines: 3, bytes: 59 });
});

test('MCP servers: transport, host, command basename, package, scope dedupe', async () => {
  const c = (await scanFixture({ usage: false })).profile.claudeCode;
  assert.ok(c);
  assert.deepEqual(c.mcpServers.map((s) => s.name), ['leaky-stdio', 'npx-server', 'proj-server', 'remote', 'sse-one']);
  assert.deepEqual(byName(c.mcpServers, 'leaky-stdio'), { name: 'leaky-stdio', transport: 'stdio', scope: 'user', command: 'acme-mcp-proxy', calls: 0 });
  assert.deepEqual(byName(c.mcpServers, 'npx-server'), { name: 'npx-server', transport: 'stdio', scope: 'user', command: 'npx', package: '@scope/pkg', calls: 0 });
  assert.deepEqual(byName(c.mcpServers, 'remote'), { name: 'remote', transport: 'http', scope: 'user', host: 'mcp.notion.com', calls: 0 });
  assert.deepEqual(byName(c.mcpServers, 'sse-one'), { name: 'sse-one', transport: 'sse', scope: 'user', host: 'bindings.mcp.cloudflare.com', calls: 0 });
  assert.deepEqual(byName(c.mcpServers, 'proj-server'), { name: 'proj-server', transport: 'http', scope: 'project', calls: 0 });
});

test('skills: symlinked dir followed, only folders with SKILL.md, plugin skills prefixed', async () => {
  const { profile } = await scanFixture({ usage: false });
  const c = profile.claudeCode;
  assert.ok(c);
  assert.deepEqual(c.skills.map((s) => [s.name, s.source]), [
    ['alpha', 'user'], ['beta', 'user'], ['broken', 'user'], ['colon', 'user'], ['myplug:gamma', 'plugin:myplug'],
  ]);
  assert.equal(byName(c.skills, 'colon').description, 'Strict YAML rejects this: but Claude Code reads it');
  assert.equal(
    byName(c.skills, 'alpha').description,
    'Alpha skill. Key <secret> docs docs.example.com mail <email> notes ~/secret/notes.md',
  );
  assert.ok(profile.warnings.some((w) => w.startsWith('~/.claude/skills/broken/SKILL.md: frontmatter')));
});

test('agents: frontmatter fields, toolCount, mcp servers, plugin agents', async () => {
  const c = (await scanFixture({ usage: false })).profile.claudeCode;
  assert.ok(c);
  assert.deepEqual(byName(c.agents, 'reviewer'), {
    name: 'reviewer', description: 'Reviews code. Token <secret>', model: 'opus', effort: 'medium',
    toolCount: 5, mcpServers: ['npx-server', 'remote'], source: 'user', uses: 0,
  });
  assert.equal(byName(c.agents, 'free').toolCount, null);
  assert.deepEqual(byName(c.agents, 'myplug:helper').mcpServers, ['plugsrv']);
  assert.equal(byName(c.agents, 'myplug:helper').source, 'plugin:myplug');
});

test('hooks: one per handler, matcher normalization, labels', async () => {
  const c = (await scanFixture({ usage: false })).profile.claudeCode;
  assert.ok(c);
  assert.deepEqual(c.hooks, [
    { event: 'PreToolUse', matcher: null, type: 'command', label: 'agentpet' },
    { event: 'PreToolUse', matcher: 'Bash', type: 'command', label: 'codex-hook-stop.js' },
    { event: 'SessionStart', matcher: null, type: 'command', label: 'inline' },
    { event: 'Stop', matcher: null, type: 'command', label: 'inline' },
    { event: 'Stop', matcher: null, type: 'prompt', label: 'prompt' },
  ]);
});

test('plugins and commands', async () => {
  const c = (await scanFixture({ usage: false })).profile.claudeCode;
  assert.ok(c);
  assert.deepEqual(c.plugins, [
    { name: 'myplug', marketplace: 'market', version: '1.0.0', enabled: true, uses: 7 },
    { name: 'other', marketplace: 'market', version: '0.1.0', enabled: false, uses: 0 },
  ]);
  assert.deepEqual(c.commands, [
    { name: 'deploy', description: 'Deploy it' },
    { name: 'team:review', description: '' },
  ]);
});
