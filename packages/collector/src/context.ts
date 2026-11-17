import type { Diagnostics } from './diagnostics.js';
import type { Redactor } from './redact.js';
import type { Progress } from './usage/lines.js';

export type ScanContext = {
  home: string;
  /** Codex home: $CODEX_HOME, or <home>/.codex. Every Codex path hangs off this. */
  codexHome: string;
  /** Pi agent directory: $PI_CODING_AGENT_DIR, or <home>/.pi/agent. Every Pi path hangs off this. */
  piAgentDir: string;
  /** $PI_CODING_AGENT_SESSION_DIR when set; it wins over settings.json `sessionDir`. */
  piSessionDir: string | null;
  redactor: Redactor;
  diag: Diagnostics;
  onProgress?: (label: string) => Progress;
};
