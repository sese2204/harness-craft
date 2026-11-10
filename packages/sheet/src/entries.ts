// Items the owner can hide, for the visibility panel. Uses the same merge as toSheet() so keys always match.
import type { HarnessProfile } from '@harness-craft/schema';

import { mergeProfile } from './merge.js';
import { compareNames } from './rank.js';
import type { HiddenKind, Origin } from './types.js';

export interface VisibilityEntry {
  key: string;
  label: string;
  /** Calls/uses for MCP·skills·agents, handler count for hooks. */
  count: number;
  origins: Origin[];
}

export type VisibilityEntries = Record<HiddenKind, VisibilityEntry[]>;

const sorted = (entries: readonly VisibilityEntry[]): VisibilityEntry[] =>
  [...entries].sort((a, b) => b.count - a.count || compareNames(a.label, b.label));

export function listEntries(profile: HarnessProfile): VisibilityEntries {
  const merged = mergeProfile(profile);
  const hooks = new Map<string, VisibilityEntry>();
  for (const h of merged.hooks) {
    const prev = hooks.get(h.key);
    const origins = prev?.origins ?? [];
    hooks.set(h.key, {
      key: h.key,
      label: `${h.event} · ${h.label}`,
      count: (prev?.count ?? 0) + 1,
      origins: origins.includes(h.origin) ? origins : ([...origins, h.origin].sort() as Origin[]),
    });
  }
  return {
    mcp: sorted(merged.mcp.map((m) => ({ key: m.name, label: m.name, count: m.calls, origins: m.origins }))),
    skills: sorted(merged.skills.map((s) => ({ key: s.name, label: s.name, count: s.uses, origins: s.origins }))),
    agents: sorted(merged.agents.map((a) => ({ key: a.name, label: a.name, count: a.uses, origins: a.origins }))),
    hooks: sorted([...hooks.values()]),
  };
}
