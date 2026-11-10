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
/** GitHub login shape: letters, digits, `_`, `.`, `-`, up to 39 characters. */
export const SHARE_HANDLE_PATTERN = /^[A-Za-z0-9_.-]{1,39}$/;

export interface ShareData {
  handle: string;
  profile: HarnessProfile;
}
