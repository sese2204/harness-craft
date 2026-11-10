import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assignRarity } from '../src/rank.js';

const tiersOf = (counts: readonly number[]): string[] => {
  const items = counts.map((count, i) => ({ name: `item-${String(i).padStart(2, '0')}`, count }));
  const tiers = assignRarity(items);
  return items.map((item) => tiers.get(item.name) as string);
};

const tally = (tiers: readonly string[]): Record<string, number> =>
  tiers.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t]: (acc[t] ?? 0) + 1 }), {});

test('a single used item is legendary (max(1, round(n*0.1)))', () => {
  assert.deepEqual(tiersOf([3]), ['legendary']);
});

test('n=3 → 1 legendary, round(0.6)=1 epic, round(0.9)=1 rare', () => {
  assert.deepEqual(tiersOf([30, 20, 10]), ['legendary', 'epic', 'rare']);
});

test('n=5 → 1/1/2/1 (round half up)', () => {
  assert.deepEqual(tally(tiersOf([50, 40, 30, 20, 10])), { legendary: 1, epic: 1, rare: 2, common: 1 });
});

test('n=10 → 1/2/3/4 and n=20 → 2/4/6/8', () => {
  assert.deepEqual(tally(tiersOf(Array.from({ length: 10 }, (_, i) => 100 - i))), { legendary: 1, epic: 2, rare: 3, common: 4 });
  assert.deepEqual(tally(tiersOf(Array.from({ length: 20 }, (_, i) => 100 - i))), { legendary: 2, epic: 4, rare: 6, common: 8 });
});

test('unused items are always common and do not count toward n', () => {
  // n=2 used → 1 legendary, round(0.4)=0 epic, round(0.6)=1 rare.
  assert.deepEqual(tiersOf([0, 5, 9, 0]), ['common', 'rare', 'legendary', 'common']);
});

test('ties are broken by name ascending', () => {
  const tiers = assignRarity([
    { name: 'beta', count: 10 },
    { name: 'alpha', count: 10 },
  ]);
  assert.equal(tiers.get('alpha'), 'legendary');
  assert.equal(tiers.get('beta'), 'rare');
});

test('empty input yields an empty map', () => {
  assert.equal(assignRarity([]).size, 0);
});
