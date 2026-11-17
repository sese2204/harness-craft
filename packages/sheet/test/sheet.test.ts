import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hookKey, listEntries, mcpIcon, partyClass, toSheet } from '../src/index.js';
import { mergeProfile } from '../src/merge.js';
import { agent, claudeSource, codexSource, hook, mcp, profile, skill, visibility } from './helpers.js';

const rich = () =>
  profile({
    claudeCode: claudeSource({
      mcpServers: [mcp('github', 900, { package: '@x/github' }), mcp('notion', 300), mcp('postgres', 50), mcp('unused', 0)],
      skills: Array.from({ length: 12 }, (_, i) => skill(`skill-${String(i).padStart(2, '0')}`, i * 10)),
      agents: [
        agent('opus-reviewer', 133),
        agent('sonnet-tester', 50, { model: 'claude-sonnet-5-5' }),
        agent('haiku-scout', 40, { model: 'haiku' }),
        agent('fable-sage', 30, { model: 'fable' }),
        agent('plain', 1, { model: null }),
      ],
      hooks: [hook('Stop'), hook('Stop', 'usage-hook.js'), hook('PreToolUse', 'agentpet'), hook('Elicitation')],
    }),
    codex: codexSource({
      mcpServers: [mcp('github', 100), mcp('exa', 10)],
      skills: [skill('skill-00', 5, { source: 'plugin:superpowers' })],
      hooks: [hook('SessionStart'), hook('Notification', 'notify.sh')],
    }),
  });

test('MCP with the same name merge and sum calls across tools', () => {
  const sheet = toSheet(rich(), visibility());
  const helmet = sheet.equipment[0];
  assert.equal(helmet?.label, '투구');
  assert.equal(helmet?.item?.name, 'github');
  assert.equal(helmet?.item?.calls, 1000);
  assert.deepEqual(helmet?.item?.origins, ['claude', 'codex']);
  assert.equal(helmet?.item?.desc, '@x/github');
});

test('equipment fills 투구·갑옷·보조·주무기·장신구·신발 in rank order and leaves empty slots null', () => {
  const sheet = toSheet(rich(), visibility());
  assert.deepEqual(sheet.equipment.map((s) => s.label), ['투구', '갑옷', '보조', '주무기', '장신구', '신발']);
  assert.deepEqual(sheet.equipment.map((s) => s.item?.name ?? null), ['github', 'notion', 'postgres', 'exa', 'unused', null]);
  assert.equal(sheet.equipment[4]?.item?.rarity, 'common');
  assert.equal(sheet.equipSummary, 'MCP 장비 5/6 장착 · 스킬 12개 보유');
});

test('MCP icons use name keywords before falling back to the hash', () => {
  assert.equal(mcpIcon('GitHub'), 'shield');
  assert.equal(mcpIcon('acme-mcp-text-to-sql'), 'gear');
  assert.equal(mcpIcon('notion'), 'book');
  assert.equal(mcpIcon('slack'), 'bolt');
  assert.equal(mcpIcon('aside'), 'eye');
  assert.equal(mcpIcon('filesystem'), 'key');
  assert.equal(mcpIcon('exa'), 'scroll');
  assert.equal(mcpIcon('zzz'), mcpIcon('zzz'));
});

test('inventory shows top 9 by uses with merged skills and total count', () => {
  const sheet = toSheet(rich(), visibility());
  assert.equal(sheet.skills.total, 12);
  assert.equal(sheet.skills.shown.length, 9);
  assert.equal(sheet.skills.shown[0]?.name, 'skill-11');
  const merged = toSheet(rich(), visibility()).skills;
  const s00 = listEntries(rich()).skills.find((e) => e.key === 'skill-00');
  assert.equal(s00?.count, 5);
  assert.deepEqual(s00?.origins, ['claude', 'codex']);
  assert.ok(merged.shown.every((s) => s.acquired === '직접 제작'));
});

test('acquired label names the plugin when no source is the user', () => {
  const p = profile({ claudeCode: claudeSource({ skills: [skill('sp:tdd', 3, { source: 'plugin:superpowers' })] }) });
  assert.equal(toSheet(p, visibility()).skills.shown[0]?.acquired, '플러그인 superpowers');
});

test('party: top 4 agents, role badge without model prefix, class by model, palette colors by hash', () => {
  const sheet = toSheet(rich(), visibility());
  assert.equal(sheet.party.total, 5);
  assert.deepEqual(
    sheet.party.members.map((m) => [m.name, m.role, m.cls]),
    [
      ['opus-reviewer', 'REVIEWER', '마법사'],
      ['sonnet-tester', 'TESTER', '궁수'],
      ['haiku-scout', 'SCOUT', '도적'],
      ['fable-sage', 'FABLE-SAGE', '현자'],
    ],
  );
  const again = toSheet(rich(), visibility()).party.members[0];
  assert.equal(sheet.party.members[0]?.hair, again?.hair);
  assert.match(sheet.party.members[0]?.hair ?? '', /^#[0-9a-f]{6}$/);
});

test('role badge is capped at 12 characters and unknown models are 전사', () => {
  const p = profile({ claudeCode: claudeSource({ agents: [agent('understand-anything:file-analyzer', 1, { model: null })] }) });
  const m = toSheet(p, visibility()).party.members[0];
  assert.equal(m?.role, 'UNDERSTAND-A');
  assert.equal(m?.cls, '전사');
});

test('Claude and Codex agents with the same name merge: uses summed, first description and model kept', () => {
  const p = profile({
    claudeCode: claudeSource({ agents: [agent('reviewer', 3, { description: '', model: null }), agent('Explore', 2, { source: 'builtin', description: '', model: null })] }),
    codex: codexSource({
      agents: [
        agent('reviewer', 4, { description: 'Codex 리뷰어', model: 'gpt-5.5-luna' }),
        agent('default', 5, { source: 'builtin', description: '', model: null }),
      ],
    }),
  });
  assert.deepEqual(mergeProfile(p).agents, [
    { name: 'Explore', uses: 2, desc: '', model: null, origins: ['claude'] },
    { name: 'default', uses: 5, desc: '', model: null, origins: ['codex'] },
    { name: 'reviewer', uses: 7, desc: 'Codex 리뷰어', model: 'gpt-5.5-luna', origins: ['claude', 'codex'] },
  ]);
  const party = toSheet(p, visibility()).party;
  assert.equal(party.total, 3);
  assert.deepEqual(party.members.map((m) => [m.name, m.uses, m.cls]), [['reviewer', 7, '궁수'], ['default', 5, '전사'], ['Explore', 2, '전사']]);
});

test('a profile without codex.agents (older file) still renders Claude agents', () => {
  const codex = codexSource();
  delete codex.agents;
  const p = profile({ claudeCode: claudeSource({ agents: [agent('a', 1)] }), codex });
  assert.deepEqual(toSheet(p, visibility()).party.members.map((m) => m.name), ['a']);
});

test('party class covers Codex model families; Claude families are checked first', () => {
  assert.equal(partyClass('gpt-5.5-luna'), '궁수');
  assert.equal(partyClass('gpt-5.5-sol'), '마법사');
  assert.equal(partyClass('gpt-5.5-astra'), '도적');
  for (const model of ['gpt-5.5', 'gpt-5.3-codex', 'o3', 'o4-mini', 'codex-mini-latest']) assert.equal(partyClass(model), '전사', model);
  assert.equal(partyClass('claude-opus-5-5'), '마법사');
  // Codex family names must be a whole segment.
  for (const model of ['console-model', 'gpt-solid', 'lunatic-1', 'astral']) assert.equal(partyClass(model), '전사', model);
  assert.equal(partyClass('gpt_sol.v2'), '마법사');
  assert.equal(partyClass(null), '전사');
});

test('passives: priority events first, non-inline label or default name, handler count', () => {
  const sheet = toSheet(rich(), visibility());
  assert.deepEqual(
    sheet.passives.map((p) => [p.event, p.name, p.desc]),
    [
      ['PreToolUse', 'agentpet', '핸들러 1개'],
      ['Stop', 'usage-hook.js', '핸들러 2개'],
      ['Notification', 'notify.sh', '핸들러 1개'],
      ['SessionStart', '출정 준비', '핸들러 1개'],
    ],
  );
});

test('non-priority events fill remaining passive slots', () => {
  const p = profile({ claudeCode: claudeSource({ hooks: [hook('Zeta'), hook('Alpha'), hook('Alpha'), hook('Stop')] }) });
  assert.deepEqual(toSheet(p, visibility()).passives.map((x) => [x.event, x.name]), [
    ['Stop', '마무리 의식'],
    ['Alpha', 'Alpha'],
    ['Zeta', 'Zeta'],
  ]);
});

test('hidden items are removed before slot order and stats; rarity stays absolute', () => {
  const base = toSheet(rich(), visibility());
  const hidden = toSheet(
    rich(),
    visibility({ hidden: { mcp: ['github'], skills: ['skill-11'], agents: ['opus-reviewer'], hooks: [hookKey(hook('Stop'))] } }),
  );
  assert.equal(hidden.equipment[0]?.item?.name, 'notion');
  // Rarity is absolute (call count), so hiding github moves notion up a slot but doesn't promote it.
  assert.equal(hidden.equipment[0]?.item?.rarity, base.equipment[1]?.item?.rarity);
  assert.ok(hidden.equipment.every((s) => s.item?.name !== 'github'));
  assert.equal(hidden.skills.total, 11);
  assert.ok(hidden.skills.shown.every((s) => s.name !== 'skill-11'));
  assert.equal(hidden.party.total, 4);
  assert.equal(hidden.party.members[0]?.name, 'sonnet-tester');
  assert.equal(hidden.passives.find((p) => p.event === 'Stop')?.desc, '핸들러 1개');
  const raw = (s: typeof base, key: string) => s.stats.find((x) => x.key === key)?.raw;
  assert.equal(raw(hidden, 'tooling'), (raw(base, 'tooling') ?? 0) - 1000);
  assert.equal(raw(hidden, 'command'), (raw(base, 'command') ?? 0) - 133);
});

test('showDescriptions=false blanks every description field', () => {
  const sheet = toSheet(rich(), visibility({ showDescriptions: false }));
  assert.ok(sheet.skills.shown.every((s) => s.desc === ''));
  assert.ok(sheet.party.members.every((m) => m.desc === ''));
  assert.ok(sheet.equipment.every((s) => !s.item || s.item.desc === ''));
  const shown = toSheet(rich(), visibility({ showDescriptions: true }));
  assert.equal(shown.party.members[0]?.desc, 'opus-reviewer 담당');
});

test('empty profile (no Claude Code, no Codex) still renders a full sheet', () => {
  const sheet = toSheet(profile(), visibility({ handle: '' }));
  assert.equal(sheet.handle, 'player');
  assert.equal(sheet.equipment.length, 6);
  assert.ok(sheet.equipment.every((s) => s.item === null));
  assert.deepEqual(sheet.skills, { shown: [], total: 0 });
  assert.deepEqual(sheet.party, { members: [], total: 0 });
  assert.deepEqual(sheet.passives, []);
  assert.ok(sheet.stats.every((s) => s.value === 0));
  assert.equal(sheet.level.level, 0);
  assert.equal(sheet.equipSummary, 'MCP 장비 0/6 장착 · 스킬 0개 보유');
  assert.deepEqual(sheet.sources, []);
});

test('handle and updatedAt are normalized', () => {
  const sheet = toSheet(profile(), visibility({ handle: '  @hyeonwoo dev ' }));
  assert.equal(sheet.handle, 'hyeonwoo-dev');
  assert.equal(sheet.updatedAt, '2026.11.09');
});

test('output is deterministic and does not mutate the input', () => {
  const input = rich();
  const snapshot = JSON.stringify(input);
  const a = toSheet(input, visibility());
  const b = toSheet(rich(), visibility());
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(input), snapshot);
});

test('listEntries groups hooks by key with handler counts', () => {
  const entries = listEntries(rich());
  assert.deepEqual(entries.hooks.find((h) => h.key === 'Stop:inline'), {
    key: 'Stop:inline', label: 'Stop · inline', count: 1, origins: ['claude'],
  });
  assert.equal(entries.mcp[0]?.key, 'github');
  assert.equal(entries.mcp[0]?.count, 1000);
});
