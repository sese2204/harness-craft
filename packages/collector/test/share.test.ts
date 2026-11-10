import assert from 'node:assert/strict';
import { test } from 'node:test';

import { escapeJsonForHtml, fillShareTemplate } from '../src/shareHtml.js';
import { SHARE_PLACEHOLDER } from '../src/shareFormat.js';
import { globMatcher, prepareShareProfile } from '../src/shareProfile.js';
import type { HarnessProfile } from '../src/types.js';
import { scanFixture } from './helpers.js';

const NO_HIDE = { hide: [], descriptions: true } as const;

function allNames(profile: HarnessProfile): string[] {
  const c = profile.claudeCode;
  const x = profile.codex;
  return [
    ...(c ? [...c.mcpServers, ...c.skills, ...c.agents, ...c.plugins, ...c.commands].map((i) => i.name) : []),
    ...(x ? [...x.mcpServers, ...x.skills, ...x.commands].map((i) => i.name) : []),
  ];
}

test('globMatcher: case-insensitive, * matches any run, everything else literal', () => {
  const m = globMatcher(['NPX-*', 'a.b', '*secret*']);
  assert.equal(m('npx-server'), true);
  assert.equal(m('npx-'), true);
  assert.equal(m('my-npx-server'), false);
  assert.equal(m('a.b'), true);
  assert.equal(m('axb'), false, '. is literal, not a regex wildcard');
  assert.equal(m('top-SECRET-thing'), true);
  assert.equal(globMatcher([])('anything'), false);
});

test('prepareShareProfile removes matching items from both sources and counts them', async () => {
  const { profile } = await scanFixture();
  const { profile: out, hidden } = prepareShareProfile(profile, { hide: ['NPX-*', 'Alpha', 'acme-*', 'deploy', 'worklog'], descriptions: true });
  const names = allNames(out);
  for (const gone of ['npx-server', 'alpha', 'acme-mcp', 'deploy', 'worklog']) assert.equal(names.includes(gone), false, gone);
  assert.ok(names.includes('beta') && names.includes('remote') && names.includes('web'));
  assert.equal(hidden, 5);
  // Agents keep their place but lose references to hidden MCP servers.
  assert.deepEqual(out.claudeCode?.agents.find((a) => a.name === 'reviewer')?.mcpServers, ['remote']);
});

test('hidden names appear nowhere in the shared JSON', async () => {
  const { profile } = await scanFixture();
  const hide = ['npx-server', 'remote', 'broken', 'myplug', 'reviewer', 'team:*'];
  const json = JSON.stringify(prepareShareProfile(profile, { hide, descriptions: true }).profile);
  for (const name of ['npx-server', '"remote"', 'broken', 'myplug', 'gamma', 'helper', 'plugsrv', 'reviewer', 'team:review']) {
    assert.equal(json.includes(name), false, `hidden name leaked: ${name}`);
  }
  // Not vacuous: the same names are present without --hide.
  const full = JSON.stringify(prepareShareProfile(profile, NO_HIDE).profile);
  for (const name of ['npx-server', 'broken', 'myplug', 'reviewer', 'team:review']) assert.ok(full.includes(name), name);
});

test('hooks are hidden when the label or the event matches', async () => {
  const { profile } = await scanFixture({ usage: false });
  const byLabel = prepareShareProfile(profile, { hide: ['AGENT*', 'notify.py'], descriptions: true });
  assert.deepEqual(byLabel.profile.claudeCode?.hooks.map((h) => h.label), ['codex-hook-stop.js', 'inline', 'inline', 'prompt']);
  assert.deepEqual(byLabel.profile.codex?.hooks, []);
  assert.equal(byLabel.hidden, 2);
  const byEvent = prepareShareProfile(profile, { hide: ['stop'], descriptions: true });
  assert.deepEqual(byEvent.profile.claudeCode?.hooks.map((h) => h.event), ['PreToolUse', 'PreToolUse', 'SessionStart']);
  assert.deepEqual(byEvent.profile.codex?.hooks, []);
});

test('descriptions are blanked unless asked for, together with MCP package/host/command', async () => {
  const { profile } = await scanFixture({ usage: false });
  const hidden = prepareShareProfile(profile, { hide: [], descriptions: false }).profile;
  const c = hidden.claudeCode;
  const x = hidden.codex;
  assert.ok(c && x);
  for (const item of [...c.skills, ...c.agents, ...c.commands, ...x.skills, ...x.commands]) assert.equal(item.description, '', item.name);
  for (const s of [...c.mcpServers, ...x.mcpServers]) {
    assert.equal(s.package ?? s.host ?? s.command, undefined, s.name);
  }
  const kept = prepareShareProfile(profile, NO_HIDE).profile;
  assert.equal(kept.claudeCode?.skills.find((s) => s.name === 'colon')?.description, 'Strict YAML rejects this: but Claude Code reads it');
  assert.equal(kept.claudeCode?.mcpServers.find((s) => s.name === 'npx-server')?.package, '@scope/pkg');
});

test('prepareShareProfile drops warnings and does not mutate its input', async () => {
  const { profile } = await scanFixture({ usage: false });
  const before = JSON.stringify(profile);
  assert.ok(profile.warnings.length > 0);
  const { profile: out } = prepareShareProfile(profile, { hide: ['*'], descriptions: false });
  assert.deepEqual(out.warnings, []);
  assert.deepEqual(allNames(out), []);
  assert.equal(JSON.stringify(profile), before);
});

test('escapeJsonForHtml escapes <, >, & and the JS line separators, and stays valid JSON', () => {
  const value = { name: '</script><script>alert(1)</script> & \u2028\u2029' };
  const escaped = escapeJsonForHtml(value);
  assert.equal(/[<>&\u2028\u2029]/.test(escaped), false);
  assert.deepEqual(JSON.parse(escaped), value);
});

test('fillShareTemplate replaces the single placeholder and keeps the <script count', () => {
  const template = `<html><script type="application/json" id="d">${SHARE_PLACEHOLDER}</script><script>run()</script></html>`;
  const html = fillShareTemplate(template, { handle: 'x', profile: { name: '</script><script>alert(1)</script>' } });
  assert.equal(html.includes(SHARE_PLACEHOLDER), false);
  assert.equal(html.split('<script').length, template.split('<script').length);
  assert.equal(html.toLowerCase().split('</script').length, template.split('</script').length);
});

test('fillShareTemplate refuses a template without exactly one placeholder', () => {
  assert.throws(() => fillShareTemplate('<html></html>', { handle: 'x', profile: {} }), /자리표시자/);
  assert.throws(() => fillShareTemplate(`${SHARE_PLACEHOLDER}${SHARE_PLACEHOLDER}`, { handle: 'x', profile: {} }), /자리표시자/);
});
