import { parse } from 'smol-toml';

import type { Diagnostics } from '../diagnostics.js';
import { isRecord, readTextOrNull } from '../fsutil.js';

/** Parses ~/.codex/config.toml. Missing -> {}; broken -> warning + {}. */
export async function readCodexConfig(path: string, diag: Diagnostics): Promise<Record<string, unknown>> {
  const text = await readTextOrNull(path, diag);
  if (text === null) return {};
  try {
    const parsed: unknown = parse(text);
    return isRecord(parsed) ? parsed : {};
  } catch (err) {
    const message = err instanceof Error ? err.message.split('\n')[0] ?? '' : String(err);
    diag.warn(path, `TOML 파싱 실패 (${message.slice(0, 120)})`);
    return {};
  }
}
