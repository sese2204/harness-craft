// Deterministic name hashing (FNV-1a over UTF-16 code units, 32-bit). No randomness anywhere in the sheet.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function hashName(value: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

export function pickByHash<T>(value: string, choices: readonly T[]): T {
  if (choices.length === 0) throw new Error('pickByHash: choices must not be empty');
  return choices[hashName(value) % choices.length] as T;
}
