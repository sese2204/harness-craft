import { join } from 'node:path';

import { collectClaudeCode } from './claude/index.js';
import { collectCodex } from './codex/index.js';
import type { ScanContext } from './context.js';
import { Diagnostics } from './diagnostics.js';
import { collectPi } from './pi/index.js';
import { Redactor } from './redact.js';
import type { Activity, HarnessProfile } from './types.js';
import { dateRange, type Progress } from './usage/lines.js';
import { collectorVersion } from './version.js';

export type CollectOptions = {
  home: string;
  /** Codex home ($CODEX_HOME). Default <home>/.codex. Never read from the environment here, so tests stay hermetic. */
  codexHome?: string;
  /** Pi agent directory ($PI_CODING_AGENT_DIR). Default <home>/.pi/agent. Never read from the environment here. */
  piAgentDir?: string;
  /** Pi session directory ($PI_CODING_AGENT_SESSION_DIR). Default: settings.json `sessionDir`, else <piAgentDir>/sessions. */
  piSessionDir?: string;
  usage: boolean;
  /** Subscription plans (Claude, ChatGPT for Codex). Default true; false leaves both null (`--no-plan`). */
  plan?: boolean;
  now?: () => Date;
  onProgress?: (label: string) => Progress;
};

/**
 * Active days across all tools: the union of dates, so a day used in several counts once. Only the count and the first
 * and last day go out; the day list itself would show the work schedule. null when no usage scan ran.
 */
export function unionActivity(...daySets: ReadonlyArray<ReadonlySet<string> | null>): Activity | null {
  const ran = daySets.filter((d): d is ReadonlySet<string> => d !== null);
  if (ran.length === 0) return null;
  return dateRange(new Set(ran.flatMap((d) => [...d])));
}

/** Scans one home directory and returns the profile. Reads only; never touches the network. */
export async function collectProfile(options: CollectOptions): Promise<HarnessProfile> {
  const redactor = new Redactor(options.home);
  const diag = new Diagnostics(options.home);
  const codexHome = options.codexHome ?? join(options.home, '.codex');
  const piAgentDir = options.piAgentDir ?? join(options.home, '.pi', 'agent');
  const ctx: ScanContext = {
    home: options.home, codexHome, piAgentDir, piSessionDir: options.piSessionDir ?? null, redactor, diag, onProgress: options.onProgress,
  };
  const plan = options.plan ?? true;
  const claude = await collectClaudeCode(ctx, { usage: options.usage, plan });
  const codex = await collectCodex(ctx, { usage: options.usage, plan });
  const pi = await collectPi(ctx, { usage: options.usage });
  return {
    schemaVersion: 1,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    collector: { name: 'harness-craft', version: collectorVersion() },
    claudeCode: claude.source,
    codex: codex.source,
    pi: pi.source,
    activity: unionActivity(claude.days, codex.days, pi.days),
    redactions: redactor.totals(),
    warnings: diag.list(),
  };
}
