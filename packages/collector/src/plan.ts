// Subscription plans (docs/collector-spec.md 「구독 등급」). Only allowlisted enum values ever leave this module.
import { isRecord } from './fsutil.js';
import type { ClaudePlan, CodexPlan } from './types.js';

const CLAUDE_PLANS: ReadonlySet<string> = new Set<ClaudePlan>(['free', 'pro', 'max', 'team', 'enterprise']);
const CODEX_PLANS: ReadonlySet<string> = new Set<CodexPlan>(['free', 'go', 'plus', 'pro', 'team', 'business', 'enterprise', 'edu']);
const CLAUDE_ORG_PREFIX = 'claude_';
/** Codex plan_type values folded into a listed plan. */
const CODEX_ALIASES: Readonly<Record<string, CodexPlan>> = { prolite: 'pro' };

function lowerTrim(value: unknown): string | null {
  return typeof value === 'string' ? value.trim().toLowerCase() : null;
}

/**
 * `~/.claude.json` oauthAccount → plan. Reads only `organizationType` (e.g. `claude_max`, a leading `claude_` dropped)
 * and, when that is missing or not listed, `planDisplayName` if it is exactly a listed plan. Every other oauthAccount
 * field (email, names, uuids) is left untouched. null when nothing matches.
 */
export function claudePlanOf(oauthAccount: unknown): ClaudePlan | null {
  if (!isRecord(oauthAccount)) return null;
  const org = lowerTrim(oauthAccount.organizationType);
  const fromOrg = org !== null && org.startsWith(CLAUDE_ORG_PREFIX) ? org.slice(CLAUDE_ORG_PREFIX.length) : org;
  if (fromOrg !== null && CLAUDE_PLANS.has(fromOrg)) return fromOrg as ClaudePlan;
  const display = lowerTrim(oauthAccount.planDisplayName);
  return display !== null && CLAUDE_PLANS.has(display) ? (display as ClaudePlan) : null;
}

/** A Codex `rate_limits.plan_type` → plan. `prolite` counts as `pro`; anything not listed is null. */
export function codexPlanOf(planType: string | null): CodexPlan | null {
  const raw = lowerTrim(planType);
  if (raw === null) return null;
  const plan = CODEX_ALIASES[raw] ?? raw;
  return CODEX_PLANS.has(plan) ? (plan as CodexPlan) : null;
}
