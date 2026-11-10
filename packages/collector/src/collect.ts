import { collectClaudeCode } from './claude/index.js';
import { collectCodex } from './codex/index.js';
import type { ScanContext } from './context.js';
import { Diagnostics } from './diagnostics.js';
import { Redactor } from './redact.js';
import type { HarnessProfile } from './types.js';
import type { Progress } from './usage/lines.js';
import { collectorVersion } from './version.js';

export type CollectOptions = {
  home: string;
  usage: boolean;
  now?: () => Date;
  onProgress?: (label: string) => Progress;
};

/** Scans one home directory and returns the profile. Reads only; never touches the network. */
export async function collectProfile(options: CollectOptions): Promise<HarnessProfile> {
  const redactor = new Redactor(options.home);
  const diag = new Diagnostics(options.home);
  const ctx: ScanContext = { home: options.home, redactor, diag, onProgress: options.onProgress };
  const claudeCode = await collectClaudeCode(ctx, { usage: options.usage });
  const codex = await collectCodex(ctx, { usage: options.usage });
  return {
    schemaVersion: 1,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    collector: { name: 'harness-craft', version: collectorVersion() },
    claudeCode,
    codex,
    redactions: redactor.totals(),
    warnings: diag.list(),
  };
}
