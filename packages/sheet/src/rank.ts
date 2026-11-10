// Ordering and rarity tiers shared by skills and equipment (docs/sheet-mapping.md 「레어도」).
import type { Rarity } from './types.js';

export interface Counted {
  name: string;
  count: number;
}

const LEGENDARY_SHARE = 0.1;
const EPIC_SHARE = 0.2;
const RARE_SHARE = 0.3;

/** Locale-independent name comparison so the order never depends on the runtime. */
export function compareNames(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** count descending, then name ascending. */
export function byCountThenName(a: Counted, b: Counted): number {
  return b.count - a.count || compareNames(a.name, b.name);
}

export function sortByCount<T extends Counted>(items: readonly T[]): T[] {
  return [...items].sort(byCountThenName);
}

/**
 * Items with count >= 1 are ranked; the top max(1, round(n*0.1)) are legendary, the next round(n*0.2) epic,
 * the next round(n*0.3) rare and the rest common. Unused items are always common.
 */
export function assignRarity(items: readonly Counted[]): Map<string, Rarity> {
  const used = sortByCount(items.filter((item) => item.count >= 1));
  const n = used.length;
  const legendary = Math.max(1, Math.round(n * LEGENDARY_SHARE));
  const epic = legendary + Math.round(n * EPIC_SHARE);
  const rare = epic + Math.round(n * RARE_SHARE);
  const tiers = new Map<string, Rarity>(items.map((item) => [item.name, 'common']));
  used.forEach((item, index) => {
    tiers.set(item.name, index < legendary ? 'legendary' : index < epic ? 'epic' : index < rare ? 'rare' : 'common');
  });
  return tiers;
}
