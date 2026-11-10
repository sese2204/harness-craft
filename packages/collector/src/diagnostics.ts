import { redactText } from './redact.js';

/** Collects warnings for one scan. Paths are shortened to `~` and scrubbed (not counted as redactions). */
export class Diagnostics {
  private readonly items: string[] = [];

  constructor(private readonly home: string) {}

  warn(path: string, reason: string): void {
    const raw = `${this.shorten(path)}: ${reason}`;
    this.items.push(redactText(raw, { home: this.home, maxLength: 400 }).text);
  }

  shorten(path: string): string {
    if (path === this.home) return '~';
    return path.startsWith(this.home + '/') ? '~' + path.slice(this.home.length) : path;
  }

  list(): string[] {
    return [...this.items];
  }
}

/** Short, path-free description of an error (fs error messages embed absolute paths). */
export function describeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    if (err instanceof SyntaxError) return `파싱 실패 (${err.message.slice(0, 120)})`;
    if (err instanceof Error) return err.message.slice(0, 160);
  }
  return String(err).slice(0, 160);
}
