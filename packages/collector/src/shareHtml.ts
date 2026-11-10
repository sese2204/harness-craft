// Fills dist/share-template.html with the profile (docs/share-spec.md).
import { readFile } from 'node:fs/promises';

import { SHARE_PLACEHOLDER, SHARE_TEMPLATE_FILE } from './shareFormat.js';

/** Next to the compiled CLI: dist/share-template.html, written by scripts/build-share-template.mjs. */
export const SHARE_TEMPLATE_URL = new URL(`./${SHARE_TEMPLATE_FILE}`, import.meta.url);

const HTML_UNSAFE: Readonly<Record<string, string>> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/** JSON safe to place inside `<script>`: no `</script>`, `<!--` or line separators survive as raw characters. */
export function escapeJsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (ch) => HTML_UNSAFE[ch] ?? ch);
}

/** Replaces the one placeholder in the template. Throws when it is missing or appears more than once. */
export function fillShareTemplate(template: string, data: unknown): string {
  const at = template.indexOf(SHARE_PLACEHOLDER);
  if (at === -1 || template.indexOf(SHARE_PLACEHOLDER, at + 1) !== -1) {
    throw new Error(`공유 템플릿에 자리표시자 ${SHARE_PLACEHOLDER} 가 정확히 한 번 있어야 합니다.`);
  }
  return `${template.slice(0, at)}${escapeJsonForHtml(data)}${template.slice(at + SHARE_PLACEHOLDER.length)}`;
}

export async function loadShareTemplate(url: URL = SHARE_TEMPLATE_URL): Promise<string> {
  try {
    return await readFile(url, 'utf8');
  } catch (err) {
    throw new Error(`공유 템플릿을 읽지 못했습니다 (${url.pathname}). 패키지를 다시 빌드하세요.`, { cause: err });
  }
}
