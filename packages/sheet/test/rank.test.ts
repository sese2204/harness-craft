import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MCP_RARITY, SKILL_RARITY, rarityFor, sortByCount } from '../src/rank.js';

test('MCP rarity uses absolute call counts: <50 common, 50 rare, 300 epic, 1000 legendary', () => {
  const tiers = [0, 49, 50, 299, 300, 999, 1000, 50_000].map((c) => rarityFor(c, MCP_RARITY));
  assert.deepEqual(tiers, ['common', 'common', 'rare', 'rare', 'epic', 'epic', 'legendary', 'legendary']);
});

test('skill rarity uses absolute use counts: <5 common, 5 rare, 30 epic, 100 legendary', () => {
  const tiers = [0, 4, 5, 29, 30, 99, 100].map((c) => rarityFor(c, SKILL_RARITY));
  assert.deepEqual(tiers, ['common', 'common', 'rare', 'rare', 'epic', 'epic', 'legendary']);
});

test('a lone low-use item is not legendary (no rank-based floor)', () => {
  assert.equal(rarityFor(3, MCP_RARITY), 'common');
});

test('sortByCount orders by count descending, ties by name ascending', () => {
  const sorted = sortByCount([
    { name: 'beta', count: 10 },
    { name: 'alpha', count: 10 },
    { name: 'gamma', count: 20 },
  ]);
  assert.deepEqual(sorted.map((s) => s.name), ['gamma', 'alpha', 'beta']);
});
