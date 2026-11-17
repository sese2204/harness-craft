// Equipment slots (MCP) and skill inventory (docs/sheet-mapping.md 「칸별 규칙」).
import type { Source } from '@harness-craft/schema';

import { pickByHash } from './hash.js';
import type { MergedMcp, MergedSkill } from './merge.js';
import { MCP_RARITY, SKILL_RARITY, rarityFor, sortByCount } from './rank.js';
import type { EquipSlot, EquipSlotId, IconName, SkillCard } from './types.js';

export const ICON_NAMES: readonly IconName[] = [
  'sword', 'shield', 'potion', 'book', 'gear', 'scroll', 'star', 'eye', 'key', 'bolt',
];

/** Slot order = MCP rank order (1st → helmet). */
export const EQUIP_SLOTS: ReadonlyArray<{ slot: EquipSlotId; label: string }> = [
  { slot: 'helmet', label: '투구' },
  { slot: 'armor', label: '갑옷' },
  { slot: 'offhand', label: '보조' },
  { slot: 'weapon', label: '주무기' },
  { slot: 'accessory', label: '장신구' },
  { slot: 'boots', label: '신발' },
];

export const INVENTORY_SIZE = 9;

const MCP_ICON_KEYWORDS: ReadonlyArray<readonly [IconName, readonly string[]]> = [
  ['shield', ['github']],
  ['gear', ['postgres', 'sql', 'db', 'data']],
  ['book', ['notion', 'obsidian', 'doc', 'wiki']],
  ['bolt', ['slack', 'mail', 'notify']],
  ['eye', ['playwright', 'browser', 'chrome', 'aside']],
  ['key', ['file', 'fs']],
  ['scroll', ['search', 'exa']],
];

export function mcpIcon(name: string): IconName {
  const lower = name.toLowerCase();
  const hit = MCP_ICON_KEYWORDS.find(([, words]) => words.some((w) => lower.includes(w)));
  return hit ? hit[0] : pickByHash(name, ICON_NAMES);
}

export function buildEquipment(mcp: readonly MergedMcp[], showDescriptions: boolean): EquipSlot[] {
  const top = sortByCount(mcp.map((m) => ({ ...m, count: m.calls }))).slice(0, EQUIP_SLOTS.length);
  return EQUIP_SLOTS.map(({ slot, label }, index) => {
    const m = top[index];
    if (!m) return { slot, label, item: null };
    return {
      slot,
      label,
      item: {
        name: m.name,
        icon: mcpIcon(m.name),
        rarity: rarityFor(m.calls, MCP_RARITY),
        calls: m.calls,
        desc: showDescriptions ? m.desc : '',
        origins: [...m.origins],
      },
    };
  });
}

/** `직접 제작` when any merged source is the user's own, otherwise the first plugin's name, otherwise `기본 제공`. */
export function acquiredLabel(sources: readonly Source[]): string {
  if (sources.length === 0 || sources.includes('user')) return '직접 제작';
  const plugin = sources.find((s) => s.startsWith('plugin:'));
  return plugin === undefined ? '기본 제공' : `플러그인 ${plugin.slice('plugin:'.length)}`;
}

export function buildInventory(skills: readonly MergedSkill[], showDescriptions: boolean): SkillCard[] {
  return sortByCount(skills.map((s) => ({ ...s, count: s.uses })))
    .slice(0, INVENTORY_SIZE)
    .map((s) => ({
      name: s.name,
      icon: pickByHash(s.name, ICON_NAMES),
      rarity: rarityFor(s.uses, SKILL_RARITY),
      uses: s.uses,
      desc: showDescriptions ? s.desc : '',
      acquired: acquiredLabel(s.sources),
      origins: [...s.origins],
    }));
}
