import { join } from 'node:path';

import type { Diagnostics } from '../diagnostics.js';
import { isRecord, readJsonOrNull } from '../fsutil.js';

export type ClaudeConfig = {
  claudeDir: string;
  settingsPath: string;
  settings: Record<string, unknown>;
  claudeJson: Record<string, unknown>;
};

async function readObject(path: string, diag: Diagnostics): Promise<Record<string, unknown>> {
  const value = await readJsonOrNull(path, diag);
  if (value === null) return {};
  if (!isRecord(value)) {
    diag.warn(path, '최상위가 객체가 아님');
    return {};
  }
  return value;
}

export async function readClaudeConfig(home: string, diag: Diagnostics): Promise<ClaudeConfig> {
  const claudeDir = join(home, '.claude');
  const settingsPath = join(claudeDir, 'settings.json');
  return {
    claudeDir,
    settingsPath,
    settings: await readObject(settingsPath, diag),
    claudeJson: await readObject(join(home, '.claude.json'), diag),
  };
}

export function recordField(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = obj[key];
  return isRecord(v) ? v : {};
}

export function numberField(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function stringValue(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}
