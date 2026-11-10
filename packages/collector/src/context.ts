import type { Diagnostics } from './diagnostics.js';
import type { Redactor } from './redact.js';
import type { Progress } from './usage/lines.js';

export type ScanContext = {
  home: string;
  redactor: Redactor;
  diag: Diagnostics;
  onProgress?: (label: string) => Progress;
};
