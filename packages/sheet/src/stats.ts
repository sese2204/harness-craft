// Six stat axes, title and level (docs/sheet-mapping.md 「스탯 6축」「레벨」).
import type { HarnessProfile } from 'harness-craft/src/types.js';

import type { MergedHarness } from './merge.js';
import type { LevelInfo, Stat, StatKey } from './types.js';

const HOOK_HANDLER_WEIGHT = 20;
const SKILL_COUNT_WEIGHT = 10;
const EXP_PER_LEVEL_UNIT = 25;
const EXECUTION_TOOLS = ['Bash', 'Read', 'Edit', 'Write', 'Grep', 'Glob'];

interface AxisDef {
  key: StatKey;
  name: string;
  cap: number;
  title: string;
}

/** Axis order is also the tie-break order for the title. */
export const STAT_AXES: readonly AxisDef[] = [
  { key: 'automation', name: '자동화', cap: 2_000, title: '자동화 장인' },
  { key: 'guidance', name: '지침력', cap: 1_500, title: '규칙 설계자' },
  { key: 'command', name: '에이전트 지휘', cap: 2_000, title: '파티 지휘관' },
  { key: 'tooling', name: '도구 활용', cap: 10_000, title: '장비 수집가' },
  { key: 'execution', name: '실행력', cap: 50_000, title: '터미널 전사' },
  { key: 'consistency', name: '꾸준함', cap: 120, title: '성실한 모험가' },
];

export function score(x: number, cap: number): number {
  if (!(x > 0)) return 0;
  return Math.round(100 * Math.min(1, Math.log10(1 + x) / Math.log10(1 + cap)));
}

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

export function statInputs(profile: HarnessProfile, merged: MergedHarness): Record<StatKey, number> {
  const claude = profile.claudeCode;
  const codex = profile.codex;
  const cu = claude?.usage ?? null;
  const xu = codex?.usage ?? null;
  const builtin = cu?.builtinTools ?? {};
  return {
    automation: merged.hooks.length * HOOK_HANDLER_WEIGHT + sum(merged.skills.map((s) => s.uses)),
    guidance: (claude?.instructions.lines ?? 0) + (codex?.instructions.lines ?? 0) + merged.skills.length * SKILL_COUNT_WEIGHT,
    command: sum(merged.agents.map((a) => a.uses)) + (cu?.subagentRuns ?? 0) + (xu?.subagentActivities ?? 0),
    tooling: sum(merged.mcp.map((m) => m.calls)),
    execution: sum(EXECUTION_TOOLS.map((t) => builtin[t] ?? 0)) + (xu?.commandExecutions ?? 0),
    consistency: Math.max(cu?.activeDays ?? 0, xu?.activeDays ?? 0),
  };
}

export function buildStats(inputs: Readonly<Record<StatKey, number>>): Stat[] {
  return STAT_AXES.map(({ key, name, cap }) => ({ key, name, value: score(inputs[key], cap), raw: inputs[key] }));
}

/** Highest stat wins; ties go to the earlier axis. */
export function titleFor(stats: readonly Stat[]): string {
  let best = 0;
  stats.forEach((s, i) => {
    if (s.value > (stats[best]?.value ?? -1)) best = i;
  });
  const key = stats[best]?.key;
  return STAT_AXES.find((a) => a.key === key)?.title ?? (STAT_AXES[0] as AxisDef).title;
}

export function experience(profile: HarnessProfile): number {
  return (
    (profile.claudeCode?.usage?.toolCalls ?? 0) +
    (profile.codex?.usage?.commandExecutions ?? 0) +
    (profile.codex?.usage?.mcpCalls ?? 0)
  );
}

export function levelFor(exp: number): LevelInfo {
  const safe = Math.max(0, Math.floor(exp));
  let level = Math.floor(Math.sqrt(safe / EXP_PER_LEVEL_UNIT));
  // Guard against floating point error at perfect squares.
  while (EXP_PER_LEVEL_UNIT * (level + 1) ** 2 <= safe) level += 1;
  while (level > 0 && EXP_PER_LEVEL_UNIT * level ** 2 > safe) level -= 1;
  const current = safe - EXP_PER_LEVEL_UNIT * level ** 2;
  const needed = EXP_PER_LEVEL_UNIT * ((level + 1) ** 2 - level ** 2);
  return { level, exp: safe, current, needed, progress: current / needed };
}
