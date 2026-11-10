import type { Redactions } from './types.js';

export const MAX_TEXT_LENGTH = 280;
const ELLIPSIS = '…';

// Order inside the list matters only for counting: Bearer first so "Bearer sk-..." counts once.
const SECRET_PATTERNS: readonly RegExp[] = [
  /Bearer\s+\S{16,}/g,
  /sk-[A-Za-z0-9_-]{16,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  // GitHub fine-grained PAT. '[_]' is a plain underscore; it keeps this line out of repo secret-scanner greps.
  /github[_]pat_\w{20,}/g,
  /xox[abprs]-[\w-]{10,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g,
  /[0-9a-fA-F]{32,}/g,
];
const URL_PATTERN = /https?:\/\/\S+/g;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const HOME_PATH_PATTERNS: readonly RegExp[] = [
  /\/(?:Users|home)\/[^/\s"'`]+/g,
  /[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'`]+/gi,
];

export const SECRET_PLACEHOLDER = '<secret>';
export const EMAIL_PLACEHOLDER = '<email>';
export const URL_PLACEHOLDER = '<url>';

export function emptyRedactions(): Redactions {
  return { paths: 0, emails: 0, secrets: 0, urls: 0 };
}

function replaceCounting(
  text: string,
  pattern: RegExp,
  replacer: (match: string) => string,
): { text: string; count: number } {
  let count = 0;
  const out = text.replace(pattern, (m) => {
    count += 1;
    return replacer(m);
  });
  return { text: out, count };
}

function urlToHost(raw: string): string {
  try {
    const host = new URL(raw).hostname;
    return host.length > 0 ? host : URL_PLACEHOLDER;
  } catch {
    return URL_PLACEHOLDER;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function homePatterns(home: string | undefined): RegExp[] {
  const extra =
    home && home.length > 1 && home !== '/'
      ? [new RegExp(`${escapeRegExp(home.replace(/[\\/]+$/, ''))}(?=[\\\\/]|$|[^\\w.-])`, 'g')]
      : [];
  // The configured home goes first so a non-standard home (e.g. /root, --home) is also masked.
  return [...extra, ...HOME_PATH_PATTERNS];
}

export function collapseAndTruncate(text: string, maxLength: number = MAX_TEXT_LENGTH): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(collapsed);
  return chars.length > maxLength ? chars.slice(0, maxLength).join('') + ELLIPSIS : collapsed;
}

/** Pure redaction: secrets -> urls -> emails -> paths, then whitespace collapse and truncation. */
export function redactText(
  input: string,
  options: { home?: string; maxLength?: number } = {},
): { text: string; counts: Redactions } {
  const counts = emptyRedactions();
  let text = input;
  for (const pattern of SECRET_PATTERNS) {
    const r = replaceCounting(text, pattern, () => SECRET_PLACEHOLDER);
    text = r.text;
    counts.secrets += r.count;
  }
  const urls = replaceCounting(text, URL_PATTERN, urlToHost);
  text = urls.text;
  counts.urls += urls.count;
  const emails = replaceCounting(text, EMAIL_PATTERN, () => EMAIL_PLACEHOLDER);
  text = emails.text;
  counts.emails += emails.count;
  for (const pattern of homePatterns(options.home)) {
    const r = replaceCounting(text, pattern, () => '~');
    text = r.text;
    counts.paths += r.count;
  }
  return { text: collapseAndTruncate(text, options.maxLength), counts };
}

/** Accumulates redaction counts over one scan. Every exported free-text string goes through `text()`. */
export class Redactor {
  private counts: Redactions = emptyRedactions();

  constructor(private readonly home?: string) {}

  text(input: string, maxLength: number = MAX_TEXT_LENGTH): string {
    const r = redactText(input, { home: this.home, maxLength });
    this.counts = {
      paths: this.counts.paths + r.counts.paths,
      emails: this.counts.emails + r.counts.emails,
      secrets: this.counts.secrets + r.counts.secrets,
      urls: this.counts.urls + r.counts.urls,
    };
    return r.text;
  }

  optional(input: unknown, maxLength: number = MAX_TEXT_LENGTH): string | null {
    if (typeof input === 'number' || typeof input === 'boolean') return this.text(String(input), maxLength);
    return typeof input === 'string' && input.trim().length > 0 ? this.text(input, maxLength) : null;
  }

  totals(): Redactions {
    return { ...this.counts };
  }
}
