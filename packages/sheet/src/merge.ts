// Merges Claude Code and Codex into one character and removes hidden items (docs/sheet-mapping.md 「합치기」).
import type { HarnessProfile, McpServer, Skill, Source } from 'harness-craft/src/types.js';

import { compareNames } from './rank.js';
import type { HiddenKind, Origin, Visibility } from './types.js';

export interface MergedMcp {
  name: string;
  calls: number;
  desc: string;
  origins: Origin[];
}

export interface MergedSkill {
  name: string;
  uses: number;
  desc: string;
  sources: Source[];
  origins: Origin[];
}

export interface MergedAgent {
  name: string;
  uses: number;
  desc: string;
  model: string | null;
  origins: Origin[];
}

export interface MergedHook {
  key: string;
  event: string;
  label: string;
  origin: Origin;
}

export interface MergedHarness {
  mcp: MergedMcp[];
  skills: MergedSkill[];
  agents: MergedAgent[];
  hooks: MergedHook[];
}

const ORIGIN_ORDER: readonly Origin[] = ['claude', 'codex'];

/** Visibility key of a hook. Handlers with the same event and label are indistinguishable, so they share a key. */
export function hookKey(hook: { event: string; label: string }): string {
  return `${hook.event}:${hook.label}`;
}

function addOrigin(origins: readonly Origin[], origin: Origin): Origin[] {
  if (origins.includes(origin)) return [...origins];
  return ORIGIN_ORDER.filter((o) => o === origin || origins.includes(o));
}

function mcpDesc(server: McpServer): string {
  return server.package ?? server.host ?? server.command ?? '';
}

function byName<T extends { name: string }>(map: ReadonlyMap<string, T>): T[] {
  return [...map.values()].sort((a, b) => compareNames(a.name, b.name));
}

function mergeMcp(lists: ReadonlyArray<readonly [Origin, readonly McpServer[]]>): MergedMcp[] {
  const merged = new Map<string, MergedMcp>();
  for (const [origin, servers] of lists) {
    for (const server of servers) {
      const prev = merged.get(server.name);
      merged.set(server.name, {
        name: server.name,
        calls: (prev?.calls ?? 0) + server.calls,
        desc: prev?.desc || mcpDesc(server),
        origins: addOrigin(prev?.origins ?? [], origin),
      });
    }
  }
  return byName(merged);
}

function mergeSkills(lists: ReadonlyArray<readonly [Origin, readonly Skill[]]>): MergedSkill[] {
  const merged = new Map<string, MergedSkill>();
  for (const [origin, skills] of lists) {
    for (const skill of skills) {
      const prev = merged.get(skill.name);
      const sources = prev?.sources ?? [];
      merged.set(skill.name, {
        name: skill.name,
        uses: (prev?.uses ?? 0) + skill.uses,
        desc: prev?.desc || skill.description,
        sources: sources.includes(skill.source) ? [...sources] : [...sources, skill.source],
        origins: addOrigin(prev?.origins ?? [], origin),
      });
    }
  }
  return byName(merged);
}

function mergeAgents(profile: HarnessProfile): MergedAgent[] {
  const merged = new Map<string, MergedAgent>();
  for (const agent of profile.claudeCode?.agents ?? []) {
    const prev = merged.get(agent.name);
    merged.set(agent.name, {
      name: agent.name,
      uses: (prev?.uses ?? 0) + agent.uses,
      desc: prev?.desc || agent.description,
      model: prev?.model ?? agent.model,
      origins: ['claude'],
    });
  }
  return byName(merged);
}

export function mergeProfile(profile: HarnessProfile): MergedHarness {
  const claude = profile.claudeCode;
  const codex = profile.codex;
  const hooks: MergedHook[] = [
    ...(claude?.hooks ?? []).map((h) => ({ key: hookKey(h), event: h.event, label: h.label, origin: 'claude' as const })),
    ...(codex?.hooks ?? []).map((h) => ({ key: hookKey(h), event: h.event, label: h.label, origin: 'codex' as const })),
  ];
  return {
    mcp: mergeMcp([
      ['claude', claude?.mcpServers ?? []],
      ['codex', codex?.mcpServers ?? []],
    ]),
    skills: mergeSkills([
      ['claude', claude?.skills ?? []],
      ['codex', codex?.skills ?? []],
    ]),
    agents: mergeAgents(profile),
    hooks,
  };
}

function visible<T>(items: readonly T[], hidden: readonly string[], keyOf: (item: T) => string): T[] {
  const set = new Set(hidden);
  return items.filter((item) => !set.has(keyOf(item)));
}

export function applyVisibility(merged: MergedHarness, hidden: Visibility['hidden']): MergedHarness {
  const keys = (kind: HiddenKind): readonly string[] => hidden[kind] ?? [];
  return {
    mcp: visible(merged.mcp, keys('mcp'), (m) => m.name),
    skills: visible(merged.skills, keys('skills'), (s) => s.name),
    agents: visible(merged.agents, keys('agents'), (a) => a.name),
    hooks: visible(merged.hooks, keys('hooks'), (h) => h.key),
  };
}
