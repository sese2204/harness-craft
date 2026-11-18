// Stage behind the hero from the subscription plans, and the mana bar from output tokens
// (docs/sheet-mapping.md 「구독 무대」「마나」).
import type { HarnessProfile } from '@harness-craft/schema';

import type { ManaInfo, PlanBadge, StageInfo, StageKind } from './types.js';

/** Output tokens that fill the mana bar halfway; like the stats, each further step needs much more. */
export const MANA_HALF = 5_000_000;

/** Stage order when two tools disagree: the higher one is shown. */
const STAGE_ORDER: readonly StageKind[] = ['field', 'gate', 'guild', 'throne'];

type PlanDef = { label: string; stage: StageKind };

const CLAUDE_PLANS: Readonly<Record<string, PlanDef>> = {
  free: { label: 'Claude Free', stage: 'field' },
  pro: { label: 'Claude Pro', stage: 'gate' },
  max: { label: 'Claude Max', stage: 'throne' },
  team: { label: 'Claude Team', stage: 'guild' },
  enterprise: { label: 'Claude Enterprise', stage: 'guild' },
};

const CODEX_PLANS: Readonly<Record<string, PlanDef>> = {
  free: { label: 'ChatGPT Free', stage: 'field' },
  go: { label: 'ChatGPT Go', stage: 'gate' },
  plus: { label: 'ChatGPT Plus', stage: 'gate' },
  pro: { label: 'ChatGPT Pro', stage: 'throne' },
  team: { label: 'ChatGPT Team', stage: 'guild' },
  business: { label: 'ChatGPT Business', stage: 'guild' },
  enterprise: { label: 'ChatGPT Enterprise', stage: 'guild' },
  edu: { label: 'ChatGPT Edu', stage: 'guild' },
};

/** Own-property lookup only: the profile is untrusted, so `constructor` or `__proto__` must not resolve to anything. */
function lookup(table: Readonly<Record<string, PlanDef>>, plan: unknown): PlanDef | null {
  return typeof plan === 'string' && Object.hasOwn(table, plan) ? (table[plan] as PlanDef) : null;
}

/** null when no tool has a recognized plan (older files, `--no-plan`, API-key users): the stage stays plain. */
export function buildStage(profile: HarnessProfile): StageInfo | null {
  const found: Array<PlanBadge & { stage: StageKind }> = [];
  const claude = lookup(CLAUDE_PLANS, profile.claudeCode?.plan);
  if (claude) found.push({ tool: 'claude', label: claude.label, stage: claude.stage });
  const codex = lookup(CODEX_PLANS, profile.codex?.plan);
  if (codex) found.push({ tool: 'codex', label: codex.label, stage: codex.stage });
  if (found.length === 0) return null;
  const kind = found.reduce<StageKind>((best, p) => (STAGE_ORDER.indexOf(p.stage) > STAGE_ORDER.indexOf(best) ? p.stage : best), 'field');
  return { kind, plans: found.map(({ tool, label }) => ({ tool, label })) };
}

/** null when no tool reported output tokens (older files or `--no-usage`). */
export function buildMana(profile: HarnessProfile): ManaInfo | null {
  const counts = [profile.claudeCode?.usage?.outputTokens, profile.codex?.usage?.outputTokens, profile.pi?.usage?.outputTokens]
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0);
  if (counts.length === 0) return null;
  const tokens = counts.reduce((a, b) => a + b, 0);
  return { tokens, fill: tokens / (tokens + MANA_HALF) };
}
