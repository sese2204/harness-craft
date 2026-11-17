// Contract between the share template (share/entry.tsx, scripts/build-share-template.mjs) and the CLI (docs/share-spec.md).
// No imports with runtime code: the browser bundle and the build script both load this module.
import type { HarnessProfile } from './types.js';

/** Id of the element the sheet renders into. */
export const SHARE_ROOT_ID = 'harness-share-root';
/** Id of the `<script type="application/json">` element that carries ShareData. */
export const SHARE_DATA_ID = 'harness-share-data';
/** Appears exactly once in dist/share-template.html; the CLI swaps it for the escaped ShareData JSON. */
export const SHARE_PLACEHOLDER = '__HARNESS_SHARE_DATA__';
export const SHARE_TEMPLATE_FILE = 'share-template.html';

export const DEFAULT_SHARE_HANDLE = 'player';
/** Display name only (nothing is verified or sent), counted in code points so Korean and emoji count as one each. */
export const SHARE_NAME_MAX_LENGTH = 32;
// C0 controls and DEL. Other text (Korean, emoji, `<`) is fine: the CLI escapes the JSON before it goes into HTML.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export type ShareNameResult = { ok: true; name: string } | { ok: false; error: string };

/** Trims and drops leading `@`. Empty → DEFAULT_SHARE_HANDLE. Control characters or more than 32 characters → error. */
export function validateShareName(raw: string): ShareNameResult {
  const name = raw.trim().replace(/^@+/, '').trim();
  if (name === '') return { ok: true, name: DEFAULT_SHARE_HANDLE };
  if (CONTROL_CHARS.test(name)) return { ok: false, error: '제어 문자(줄바꿈·탭 등)는 쓸 수 없습니다' };
  const length = [...name].length;
  if (length > SHARE_NAME_MAX_LENGTH) {
    return { ok: false, error: `${SHARE_NAME_MAX_LENGTH}자까지 쓸 수 있습니다 (지금 ${length}자)` };
  }
  return { ok: true, name };
}

export interface ShareData {
  handle: string;
  profile: HarnessProfile;
}
