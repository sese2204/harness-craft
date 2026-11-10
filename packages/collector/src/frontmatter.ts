import { parse } from 'yaml';

import { isRecord } from './fsutil.js';

export type Frontmatter = { data: Record<string, unknown>; error: string | null };

const FRONTMATTER_PATTERN = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

const TOP_LEVEL_LINE = /^([A-Za-z_][\w-]*):[ \t]+(.+)$/;

function unquote(value: string): string {
  const v = value.trim();
  const q = v[0];
  return (q === '"' || q === "'") && v.length >= 2 && v.endsWith(q) ? v.slice(1, -1) : v;
}

/**
 * Claude Code accepts frontmatter that strict YAML rejects (e.g. an unquoted ': ' inside a
 * description). Falls back to single-line top-level `key: value` pairs; block values are skipped.
 */
function lenientParse(block: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const line of block.split(/\r?\n/)) {
    const m = TOP_LEVEL_LINE.exec(line);
    if (!m) continue;
    const value = unquote(m[2] as string);
    if (value.length > 0 && !/^[|>][-+]?$/.test(value)) data[m[1] as string] = value;
  }
  return data;
}

/** Parses a leading YAML frontmatter block. The body is never returned. */
export function parseFrontmatter(text: string): Frontmatter {
  const match = FRONTMATTER_PATTERN.exec(text);
  if (!match) return { data: {}, error: null };
  const block = match[1] ?? '';
  try {
    const parsed: unknown = parse(block);
    return { data: isRecord(parsed) ? parsed : {}, error: null };
  } catch (err) {
    const recovered = lenientParse(block);
    if (Object.keys(recovered).length > 0) return { data: recovered, error: null };
    const message = err instanceof Error ? err.message.split('\n')[0] ?? '' : String(err);
    return { data: {}, error: `frontmatter YAML 파싱 실패 (${message.slice(0, 120)})` };
  }
}

export function stringField(data: Record<string, unknown>, key: string): string | null {
  const v = data[key];
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  if (typeof v === 'number') return String(v);
  return null;
}
