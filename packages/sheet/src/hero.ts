// The main character's class and rank (docs/sheet-mapping.md 「본체 캐릭터」).
import type { HarnessProfile } from '@harness-craft/schema';

import { partyClass } from './party.js';
import type { HeroInfo, HeroRank, Origin, PartyClass } from './types.js';

/** A second tool counts as a second class once it has at least this share of the main tool's active days. */
const MULTICLASS_MIN_SHARE = 0.25;

const RANKS: ReadonlyArray<readonly [number, HeroRank]> = [
  [50, '각성'],
  [30, '숙련'],
  [10, '정식'],
  [0, '견습'],
];

export function heroRank(level: number): HeroRank {
  return RANKS.find(([min]) => level >= min)?.[1] ?? '견습';
}

interface ToolUse {
  origin: Origin;
  activeDays: number;
  topModel: string | null;
}

function topModel(models: Readonly<Record<string, number>> | undefined): string | null {
  if (!models) return null;
  let best: [string, number] | null = null;
  for (const [name, count] of Object.entries(models)) {
    if (count <= 0 || name === 'other') continue;
    if (!best || count > best[1] || (count === best[1] && name < best[0])) best = [name, count];
  }
  return best?.[0] ?? null;
}

function toolUses(profile: HarnessProfile): ToolUse[] {
  const out: ToolUse[] = [];
  const claude = profile.claudeCode;
  if (claude) {
    out.push({
      origin: 'claude',
      activeDays: claude.usage?.activeDays ?? 0,
      topModel: topModel(claude.usage?.models) ?? claude.model,
    });
  }
  const codex = profile.codex;
  if (codex) {
    out.push({
      origin: 'codex',
      // `codex exec` runs are often driven by scripts or other agents, so only days a person opened Codex count here.
      activeDays: codex.usage?.interactiveDays ?? codex.usage?.activeDays ?? 0,
      topModel: topModel(codex.usage?.models) ?? codex.model,
    });
  }
  const pi = profile.pi;
  if (pi) {
    out.push({ origin: 'pi', activeDays: pi.usage?.activeDays ?? 0, topModel: topModel(pi.usage?.models) ?? pi.model });
  }
  return out;
}

/**
 * The main tool is the one with the most active days (Codex: interactive days; ties go to Claude Code, then Codex, then Pi);
 * its most used model picks the class. The strongest other tool adds a second class when it has ≥25% of the main tool's
 * days and maps to a different class.
 */
export function buildHero(profile: HarnessProfile, level: number): HeroInfo {
  // toolUses lists claude, codex, pi in that order and sort is stable, so ties keep that preference.
  const tools = toolUses(profile).sort((a, b) => b.activeDays - a.activeDays);
  const main = tools[0];
  const cls: PartyClass = partyClass(main?.topModel ?? null);
  const other = tools[1];
  let secondary: PartyClass | null = null;
  if (main && other && main.activeDays > 0 && other.activeDays >= main.activeDays * MULTICLASS_MIN_SHARE) {
    const otherCls = partyClass(other.topModel);
    if (otherCls !== cls) secondary = otherCls;
  }
  return { cls, secondary, model: main?.topModel ?? null, source: main?.origin ?? null, rank: heroRank(level) };
}
