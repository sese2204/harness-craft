import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildHero, heroRank } from '../src/hero.js';
import type { HarnessProfile } from '../src/types.js';
import { claudeSource, codexSource, profile } from './helpers.js';

type Models = Record<string, number>;
type Use = { days: number; models?: Models } | null;

function withUsage(claude: Use, codex: Use): HarnessProfile {
  const c = claudeSource({ model: 'sonnet' });
  const x = codexSource({ model: 'gpt-x' });
  return profile({
    claudeCode: claude && c.usage ? { ...c, usage: { ...c.usage, activeDays: claude.days, ...(claude.models ? { models: claude.models } : {}) } } : null,
    codex: codex && x.usage ? { ...x, usage: { ...x.usage, activeDays: codex.days, ...(codex.models ? { models: codex.models } : {}) } } : null,
  });
}

test('rank by level: 1–9 견습, 10–29 정식, 30–49 숙련, 50+ 각성', () => {
  assert.deepEqual([0, 9, 10, 29, 30, 49, 50, 99].map(heroRank), ['견습', '견습', '정식', '정식', '숙련', '숙련', '각성', '각성']);
});

test('class comes from the most used model of the tool with more active days', () => {
  const hero = buildHero(withUsage({ days: 40, models: { 'claude-opus-5-5': 900, 'claude-sonnet-5-5': 100 } }, { days: 5, models: { 'gpt-6-luna': 50 } }), 51);
  assert.equal(hero.cls, '마법사');
  assert.equal(hero.model, 'claude-opus-5-5');
  assert.equal(hero.source, 'claude');
  assert.equal(hero.secondary, null); // codex has < 25% of the days
  assert.equal(hero.rank, '각성');
});

test('a second tool with ≥25% of the days and a different class becomes the secondary class', () => {
  const hero = buildHero(withUsage({ days: 20, models: { 'claude-haiku-5-5': 10 } }, { days: 40, models: { 'gpt-6.1-sol': 300 } }), 12);
  assert.equal(hero.cls, '마법사');
  assert.equal(hero.source, 'codex');
  assert.equal(hero.secondary, '도적');
  assert.equal(hero.rank, '정식');
});

test('without usage models the configured model is used; `other` is never the top model', () => {
  assert.equal(buildHero(withUsage({ days: 3 }, null), 1).cls, '궁수');
  assert.equal(buildHero(withUsage({ days: 3, models: { other: 99, 'claude-haiku-5-5': 1 } }, null), 1).cls, '도적');
});

test('Codex exec-only days do not make Codex the main tool', () => {
  const p = withUsage({ days: 40, models: { 'claude-opus-5-5': 900 } }, { days: 52, models: { 'gpt-6-astra': 170 } });
  if (p.codex?.usage) p.codex.usage.interactiveDays = 12;
  const hero = buildHero(p, 51);
  assert.equal(hero.source, 'claude');
  assert.equal(hero.cls, '마법사');
  assert.equal(hero.secondary, '도적'); // 12 ≥ 25% of 40
});
