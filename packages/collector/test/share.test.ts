import assert from 'node:assert/strict';
import { test } from 'node:test';

import { escapeJsonForHtml, fillShareTemplate } from '../src/shareHtml.js';
import { SHARE_PLACEHOLDER, validateShareName } from '../src/shareFormat.js';
import { globMatcher, prepareShareProfile } from '../src/shareProfile.js';
import type { HarnessProfile } from '../src/types.js';
import { scanFixture } from './helpers.js';

const NO_HIDE = { hide: [], descriptions: true } as const;

function allNames(profile: HarnessProfile): string[] {
  const c = profile.claudeCode;
  const x = profile.codex;
  return [
    ...(c ? [...c.mcpServers, ...c.skills, ...c.agents, ...c.plugins, ...c.commands].map((i) => i.name) : []),
    ...(x ? [...x.mcpServers, ...x.skills, ...(x.agents ?? []), ...x.commands].map((i) => i.name) : []),
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

test('Codex agents are hidden and counted like Claude agents; activity is carried through unchanged', async () => {
  const { profile } = await scanFixture();
  const { profile: out, hidden } = prepareShareProfile(profile, { hide: ['planner', 'DEFAULT'], descriptions: true });
  assert.deepEqual(out.codex?.agents?.map((a) => a.name), ['lostfile', 'no-name-field', 'outsider', 'reviewer']);
  assert.equal(out.codex?.agents?.find((a) => a.name === 'reviewer')?.description, 'Reviews diffs');
  assert.equal(hidden, 2);
  assert.deepEqual(out.activity, profile.activity);
  assert.notEqual(out.activity, profile.activity);
  // A profile written before Codex agents and activity existed stays without them.
  const { activity: _a, ...old } = profile;
  const oldCodex = { ...profile.codex! };
  delete oldCodex.agents;
  const prepared = prepareShareProfile({ ...old, codex: oldCodex }, NO_HIDE).profile;
  assert.equal('activity' in prepared, false);
  assert.equal(prepared.codex && 'agents' in prepared.codex, false);
});

test('hooks are hidden when the label or the event matches', async () => {
  const { profile } = await scanFixture({ usage: false });
  const byLabel = prepareShareProfile(profile, { hide: ['AGENT*', 'notify.py'], descriptions: true });
  assert.deepEqual(byLabel.profile.claudeCode?.hooks.map((h) => h.label), ['codex-hook-stop.js', 'inline', 'inline', 'prompt']);
  assert.deepEqual(byLabel.profile.codex?.hooks.map((h) => h.label), ['kit-hook.js', 'inline-guard.sh']);
  // agentpet, notify.py, and the Codex skill agentskill (AGENT* matches every kind of item).
  assert.equal(byLabel.hidden, 3);
  const byEvent = prepareShareProfile(profile, { hide: ['stop'], descriptions: true });
  assert.deepEqual(byEvent.profile.claudeCode?.hooks.map((h) => h.event), ['PreToolUse', 'PreToolUse', 'SessionStart']);
  assert.deepEqual(byEvent.profile.codex?.hooks.map((h) => h.event), ['PostToolUse', 'PostToolUse']);
});

test('descriptions are blanked unless asked for, together with MCP package/host/command', async () => {
  const { profile } = await scanFixture({ usage: false });
  const hidden = prepareShareProfile(profile, { hide: [], descriptions: false }).profile;
  const c = hidden.claudeCode;
  const x = hidden.codex;
  assert.ok(c && x);
  assert.ok((x.agents ?? []).length > 0);
  for (const item of [...c.skills, ...c.agents, ...c.commands, ...x.skills, ...(x.agents ?? []), ...x.commands]) {
    assert.equal(item.description, '', item.name);
  }
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

test('validateShareName: any text up to 32 code points, trimmed, leading @ dropped, no control characters', () => {
  assert.deepEqual(validateShareName('  @@세현  '), { ok: true, name: '세현' });
  assert.deepEqual(validateShareName('<script>alert(1)</script>'), { ok: true, name: '<script>alert(1)</script>' });
  assert.deepEqual(validateShareName(' '), { ok: true, name: 'player' });
  assert.deepEqual(validateShareName('@'), { ok: true, name: 'player' });
  assert.deepEqual(validateShareName('🧙'.repeat(32)), { ok: true, name: '🧙'.repeat(32) });
  assert.equal(validateShareName('🧙'.repeat(33)).ok, false);
  for (const bad of ['a\u0000b', 'a\nb', 'a\u001fb', 'a\u007fb']) assert.equal(validateShareName(bad).ok, false, JSON.stringify(bad));
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
