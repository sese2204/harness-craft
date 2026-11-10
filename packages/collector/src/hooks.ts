import type { Diagnostics } from './diagnostics.js';
import { compareStrings, isRecord } from './fsutil.js';
import { hookLabel } from './hookLabel.js';
import type { Redactor } from './redact.js';
import type { Hook } from './types.js';

const MAX_LABEL_LENGTH = 64;
const MATCH_ALL = new Set(['*', '.*', '']);

function normalizeMatcher(matcher: unknown, redactor: Redactor): string | null {
  if (typeof matcher !== 'string' || MATCH_ALL.has(matcher.trim())) return null;
  return redactor.text(matcher, MAX_LABEL_LENGTH);
}

export function compareHooks(a: Hook, b: Hook): number {
  return (
    compareStrings(a.event, b.event) ||
    compareStrings(a.matcher ?? '', b.matcher ?? '') ||
    compareStrings(a.type, b.type) ||
    compareStrings(a.label, b.label)
  );
}

/**
 * Parses `{ [event]: [{ matcher?, hooks: [{ type, command? }] }] }` (Claude settings.json `hooks`,
 * Codex hooks.json `hooks`). One handler = one Hook.
 */
export function parseHooks(
  hooks: unknown,
  sourcePath: string,
  redactor: Redactor,
  diag: Diagnostics,
): Hook[] {
  if (hooks === undefined || hooks === null) return [];
  if (!isRecord(hooks)) {
    diag.warn(sourcePath, 'hooks 가 객체가 아님');
    return [];
  }
  const out: Hook[] = [];
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {
      diag.warn(sourcePath, `hooks.${event} 가 배열이 아님`);
      continue;
    }
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group.hooks)) {
        diag.warn(sourcePath, `hooks.${event} 항목 형식이 다름`);
        continue;
      }
      const matcher = normalizeMatcher(group.matcher, redactor);
      for (const handler of group.hooks) {
        if (!isRecord(handler)) continue;
        const type = typeof handler.type === 'string' && handler.type.length > 0 ? handler.type : 'unknown';
        out.push({
          event: redactor.text(event, MAX_LABEL_LENGTH),
          matcher,
          type: redactor.text(type, MAX_LABEL_LENGTH),
          label: redactor.text(hookLabel({ type, command: handler.command }), MAX_LABEL_LENGTH),
        });
      }
    }
  }
  return out.sort(compareHooks);
}
