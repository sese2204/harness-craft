// Character sheet model produced by toSheet() (docs/sheet-mapping.md v1).
import type { HarnessProfile } from '@harness-craft/schema';

export type { HarnessProfile };

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export type IconName = 'sword' | 'shield' | 'potion' | 'book' | 'gear' | 'scroll' | 'star' | 'eye' | 'key' | 'bolt';

export type Origin = 'claude' | 'codex' | 'pi';

export type HiddenKind = 'mcp' | 'skills' | 'agents' | 'hooks';

/** What the owner chose to publish. Hidden keys come from listEntries() (`hookKey()` for hooks). */
export interface Visibility {
  handle: string;
  showDescriptions: boolean;
  hidden: Readonly<Record<HiddenKind, readonly string[]>>;
}

export type EquipSlotId = 'helmet' | 'armor' | 'offhand' | 'weapon' | 'accessory' | 'boots';

export interface EquipItem {
  name: string;
  icon: IconName;
  rarity: Rarity;
  calls: number;
  /** Package, host or command of the server. Empty when descriptions are hidden. */
  desc: string;
  origins: Origin[];
}

export interface EquipSlot {
  slot: EquipSlotId;
  label: string;
  item: EquipItem | null;
}

export interface SkillCard {
  name: string;
  icon: IconName;
  rarity: Rarity;
  uses: number;
  /** Empty when descriptions are hidden. */
  desc: string;
  /** `직접 제작` or `플러그인 {name}`. */
  acquired: string;
  origins: Origin[];
}

export type PartyClass = '마법사' | '궁수' | '도적' | '현자' | '전사';

/** Hero look by level: 1–9 견습, 10–29 정식, 30–49 숙련, 50+ 각성. */
export type HeroRank = '견습' | '정식' | '숙련' | '각성';

export interface HeroInfo {
  /** From the main tool's most used model (same mapping as party members). */
  cls: PartyClass;
  /** Class of the strongest other tool when it is used enough and differs; drawn as an accent. */
  secondary: PartyClass | null;
  model: string | null;
  source: Origin | null;
  rank: HeroRank;
}

export interface PartyMember {
  name: string;
  role: string;
  cls: PartyClass;
  model: string | null;
  uses: number;
  /** Empty when descriptions are hidden. */
  desc: string;
  hair: string;
  cloth: string;
  pants: string;
  badge: string;
}

export interface Passive {
  event: string;
  name: string;
  desc: string;
  icon: IconName;
  handlers: number;
}

export type StatKey = 'automation' | 'guidance' | 'command' | 'tooling' | 'execution' | 'consistency';

export interface Stat {
  key: StatKey;
  name: string;
  /** 0..100 */
  value: number;
  /** Input x of the score formula. */
  raw: number;
}

export interface LevelInfo {
  level: number;
  exp: number;
  /** exp - 25·L² */
  current: number;
  /** 25·((L+1)² - L²) */
  needed: number;
  /** current / needed, 0..1 */
  progress: number;
}

export interface SheetModel {
  handle: string;
  /** `YYYY.MM.DD` of generatedAt (UTC), or '' when generatedAt is not an ISO date. */
  updatedAt: string;
  sources: Origin[];
  level: LevelInfo;
  hero: HeroInfo;
  title: string;
  equipSummary: string;
  equipment: EquipSlot[];
  skills: { shown: SkillCard[]; total: number };
  party: { members: PartyMember[]; total: number };
  passives: Passive[];
  stats: Stat[];
  statTotal: number;
}
