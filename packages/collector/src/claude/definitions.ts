import { join } from 'node:path';

import type { ScanContext } from '../context.js';
import { definitionName, toAgent, toSkill, usageKeys } from '../definitions.js';
import { sortByName } from '../fsutil.js';
import { readFlatDefinitions, readSkillDefinitions, type RawDefinition } from '../items.js';
import type { Agent, Skill, Source } from '../types.js';
import { numberField, recordField } from './config.js';
import type { InstalledPlugin } from './plugins.js';

export type TranscriptCounts = {
  skillCalls: ReadonlyMap<string, number>;
  slashCalls: ReadonlyMap<string, number>;
  agentCalls: ReadonlyMap<string, number>;
};

const EMPTY_COUNTS: TranscriptCounts = { skillCalls: new Map(), slashCalls: new Map(), agentCalls: new Map() };

type Sourced = { def: RawDefinition; source: Source };

async function gather(
  userDir: string,
  plugins: readonly InstalledPlugin[],
  sub: 'skills' | 'agents',
  ctx: ScanContext,
): Promise<Sourced[]> {
  const read = sub === 'skills' ? readSkillDefinitions : readFlatDefinitions;
  const out: Sourced[] = (await read(userDir, ctx.diag)).map((def) => ({ def, source: 'user' as const }));
  for (const p of plugins) {
    if (!p.installPath) continue;
    const defs = await read(join(p.installPath, sub), ctx.diag);
    out.push(...defs.map((def) => ({ def, source: `plugin:${p.name}` as const })));
  }
  return out;
}

/**
 * uses = max(skillUsage usageCount, transcript Skill calls + same-name slash calls).
 * Plugin skills look up both '<plugin>:<name>' and '<name>' (summed per side).
 */
export function skillUsageLookup(claudeJson: Record<string, unknown>, counts: TranscriptCounts) {
  const skillUsage = recordField(claudeJson, 'skillUsage');
  return (keys: readonly string[]): { uses: number; lastUsedAt: string | null } => {
    let recorded = 0;
    let transcript = 0;
    let last: number | null = null;
    for (const key of keys) {
      const entry = recordField(skillUsage, key);
      recorded += numberField(entry, 'usageCount') ?? 0;
      const at = numberField(entry, 'lastUsedAt');
      if (at !== null && (last === null || at > last)) last = at;
      transcript += (counts.skillCalls.get(key) ?? 0) + (counts.slashCalls.get(key) ?? 0);
    }
    return { uses: Math.max(recorded, transcript), lastUsedAt: last === null ? null : new Date(last).toISOString() };
  };
}

export async function collectClaudeSkills(
  claudeDir: string,
  plugins: readonly InstalledPlugin[],
  claudeJson: Record<string, unknown>,
  counts: TranscriptCounts | null,
  ctx: ScanContext,
): Promise<Skill[]> {
  const items = await gather(join(claudeDir, 'skills'), plugins, 'skills', ctx);
  const userNames = new Set(items.filter((i) => i.source === 'user').map((i) => definitionName(i.def)));
  const lookup = skillUsageLookup(claudeJson, counts ?? EMPTY_COUNTS);
  return sortByName(
    items.map(({ def, source }) => toSkill(def, source, lookup(usageKeys(definitionName(def), source, userNames)), ctx)),
  );
}

export async function collectClaudeAgents(
  claudeDir: string,
  plugins: readonly InstalledPlugin[],
  counts: TranscriptCounts | null,
  ctx: ScanContext,
): Promise<Agent[]> {
  const items = await gather(join(claudeDir, 'agents'), plugins, 'agents', ctx);
  const userNames = new Set(items.filter((i) => i.source === 'user').map((i) => definitionName(i.def)));
  const agentCalls = (counts ?? EMPTY_COUNTS).agentCalls;
  return sortByName(
    items.map(({ def, source }) => {
      const uses = usageKeys(definitionName(def), source, userNames).reduce((sum, k) => sum + (agentCalls.get(k) ?? 0), 0);
      return toAgent(def, source, uses, ctx);
    }),
  );
}
