// Ordering and rarity tiers shared by skills and equipment (docs/sheet-mapping.md 「레어도」).
import type { Rarity } from './types.js';

export interface Counted {
  name: string;
  count: number;
}

/** Minimum count for rare / epic / legendary. Absolute, so a tier means the same thing on everyone's sheet. */
export interface RarityThresholds {
  rare: number;
  epic: number;
  legendary: number;
}

/** MCP calls (equipment). */
export const MCP_RARITY: RarityThresholds = { rare: 50, epic: 300, legendary: 1000 };
/** Skill uses (inventory). */
export const SKILL_RARITY: RarityThresholds = { rare: 5, epic: 30, legendary: 100 };

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

export function rarityFor(count: number, thresholds: RarityThresholds): Rarity {
  if (count >= thresholds.legendary) return 'legendary';
  if (count >= thresholds.epic) return 'epic';
  if (count >= thresholds.rare) return 'rare';
  return 'common';
}
