// toSheet(): harness-profile.json + visibility → character sheet model (docs/sheet-mapping.md v1).
import type { HarnessProfile } from '@harness-craft/schema';

import { buildEquipment, buildInventory, EQUIP_SLOTS } from './items.js';
import { applyVisibility, mergeProfile } from './merge.js';
import { buildParty, buildPassives } from './party.js';
import { buildHero } from './hero.js';
import { buildStats, experience, levelFor, statInputs, titleFor } from './stats.js';
import type { HiddenKind, Origin, SheetModel, Visibility } from './types.js';

export * from './types.js';
export { hashName, pickByHash } from './hash.js';
export { MCP_RARITY, SKILL_RARITY, rarityFor, type RarityThresholds } from './rank.js';
export { hookKey } from './merge.js';
export { EQUIP_SLOTS, ICON_NAMES, INVENTORY_SIZE, mcpIcon } from './items.js';
export { PARTY_SIZE, PASSIVE_SIZE, roleBadge, partyClass, CLASS_BADGE } from './party.js';
export { buildHero, heroRank } from './hero.js';
export { STAT_AXES, score, levelFor } from './stats.js';
export { listEntries, type VisibilityEntry, type VisibilityEntries } from './entries.js';
export { parseProfile, type ParseResult } from './validate.js';

export const DEFAULT_HANDLE = 'player';
export const HANDLE_MAX_LENGTH = 32;
export const HIDDEN_KINDS: readonly HiddenKind[] = ['mcp', 'skills', 'agents', 'hooks'];

export const DEFAULT_VISIBILITY: Visibility = {
  handle: DEFAULT_HANDLE,
  showDescriptions: false,
  hidden: { mcp: [], skills: [], agents: [], hooks: [] },
};

/** Trims, drops a leading `@`, collapses whitespace and caps the length. Empty → DEFAULT_HANDLE. */
export function normalizeHandle(handle: string): string {
  const cleaned = handle.trim().replace(/^@+/, '').replace(/\s+/g, '-').slice(0, HANDLE_MAX_LENGTH);
  return cleaned || DEFAULT_HANDLE;
}

/** `2026-11-09T14:21:47Z` → `2026.11.09` (UTC calendar date, no time zone conversion). */
export function formatUpdatedAt(generatedAt: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(generatedAt);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : '';
}

function sourcesOf(profile: HarnessProfile): Origin[] {
  const out: Origin[] = [];
  if (profile.claudeCode) out.push('claude');
  if (profile.codex) out.push('codex');
  return out;
}

export function toSheet(profile: HarnessProfile, visibility: Visibility): SheetModel {
  const merged = applyVisibility(mergeProfile(profile), visibility.hidden);
  const { showDescriptions } = visibility;
  const equipment = buildEquipment(merged.mcp, showDescriptions);
  const equipped = equipment.filter((slot) => slot.item !== null).length;
  const stats = buildStats(statInputs(profile, merged));
  const level = levelFor(experience(profile));
  return {
    handle: normalizeHandle(visibility.handle),
    updatedAt: formatUpdatedAt(profile.generatedAt),
    sources: sourcesOf(profile),
    level,
    hero: buildHero(profile, level.level),
    title: titleFor(stats),
    equipSummary: `MCP 장비 ${equipped}/${EQUIP_SLOTS.length} 장착 · 스킬 ${merged.skills.length}개 보유`,
    equipment,
    skills: { shown: buildInventory(merged.skills, showDescriptions), total: merged.skills.length },
    party: { members: buildParty(merged.agents, showDescriptions), total: merged.agents.length },
    passives: buildPassives(merged.hooks),
    stats,
    statTotal: stats.reduce((acc, s) => acc + s.value, 0),
  };
}
