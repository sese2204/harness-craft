// Boundary check for an untrusted harness-profile.json before it reaches toSheet().
import type { HarnessProfile } from '@harness-craft/schema';

export type ParseResult = { ok: true; profile: HarnessProfile } | { ok: false; errors: string[] };

const MAX_ERRORS = 8;

type Rec = Record<string, unknown>;
type Check = (value: unknown) => boolean;

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString: Check = (v) => typeof v === 'string';
const isCount: Check = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isStringOrNull: Check = (v) => v === null || typeof v === 'string';

const MCP_FIELDS: Readonly<Record<string, Check>> = { name: isString, calls: isCount };
const SKILL_FIELDS: Readonly<Record<string, Check>> = { name: isString, description: isString, source: isString, uses: isCount };
const AGENT_FIELDS: Readonly<Record<string, Check>> = {
  name: isString, description: isString, source: isString, uses: isCount, model: isStringOrNull,
};
const HOOK_FIELDS: Readonly<Record<string, Check>> = { event: isString, label: isString };
const CLAUDE_USAGE_FIELDS: Readonly<Record<string, Check>> = {
  subagentRuns: isCount, toolCalls: isCount, activeDays: isCount, builtinTools: isRecord,
};
const CODEX_USAGE_FIELDS: Readonly<Record<string, Check>> = {
  mcpCalls: isCount, subagentActivities: isCount, commandExecutions: isCount, activeDays: isCount,
};

function checkFields(value: unknown, fields: Readonly<Record<string, Check>>, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} 가 객체가 아닙니다`);
    return;
  }
  for (const [key, check] of Object.entries(fields)) {
    if (!check(value[key])) errors.push(`${path}.${key} 값이 올바르지 않습니다`);
  }
}

function checkList(source: Rec, key: string, fields: Readonly<Record<string, Check>>, path: string, errors: string[]): void {
  const list = source[key];
  if (!Array.isArray(list)) {
    errors.push(`${path}.${key} 가 배열이 아닙니다`);
    return;
  }
  list.forEach((item, i) => checkFields(item, fields, `${path}.${key}[${i}]`, errors));
}

function checkSource(value: unknown, path: string, kind: 'claude' | 'codex', errors: string[]): void {
  if (value === null) return;
  if (!isRecord(value)) {
    errors.push(`${path} 는 객체 또는 null 이어야 합니다`);
    return;
  }
  checkList(value, 'mcpServers', MCP_FIELDS, path, errors);
  checkList(value, 'skills', SKILL_FIELDS, path, errors);
  checkList(value, 'hooks', HOOK_FIELDS, path, errors);
  if (kind === 'claude') checkList(value, 'agents', AGENT_FIELDS, path, errors);
  checkFields(value.instructions, { lines: isCount }, `${path}.instructions`, errors);
  if (value.usage !== null) {
    checkFields(value.usage, kind === 'claude' ? CLAUDE_USAGE_FIELDS : CODEX_USAGE_FIELDS, `${path}.usage`, errors);
  }
  if (kind === 'claude' && isRecord(value.usage) && isRecord(value.usage.builtinTools)) {
    for (const [tool, n] of Object.entries(value.usage.builtinTools)) {
      if (!isCount(n)) errors.push(`${path}.usage.builtinTools.${tool} 값이 올바르지 않습니다`);
    }
  }
}

/** Validates the parts of schemaVersion 1 that the sheet reads. Never throws. */
export function parseProfile(input: unknown): ParseResult {
  if (!isRecord(input)) return { ok: false, errors: ['JSON 최상위가 객체가 아닙니다'] };
  if (input.schemaVersion !== 1) {
    return { ok: false, errors: [`schemaVersion 이 1 이 아닙니다 (받은 값: ${JSON.stringify(input.schemaVersion) ?? '없음'})`] };
  }
  const errors: string[] = [];
  if (!isString(input.generatedAt)) errors.push('generatedAt 이 없습니다');
  const sources = [['claudeCode', 'claude'], ['codex', 'codex']] as const;
  for (const [key, kind] of sources) {
    if (key in input) checkSource(input[key], key, kind, errors);
    else errors.push(`${key} 키가 없습니다`);
  }
  if (errors.length > 0) {
    const extra = errors.length > MAX_ERRORS ? [`외 ${errors.length - MAX_ERRORS}건`] : [];
    return { ok: false, errors: [...errors.slice(0, MAX_ERRORS), ...extra] };
  }
  return { ok: true, profile: input as unknown as HarnessProfile };
}
