import { readFileSync } from 'node:fs';

/** Reads the package version from package.json next to src/ or dist/. */
export function collectorVersion(): string {
  const raw: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const version = (raw as { version?: unknown }).version;
  if (typeof version !== 'string') throw new Error('package.json 에 version 이 없습니다');
  return version;
}
