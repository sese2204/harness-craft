import { basename } from './fsutil.js';

export const INLINE_LABEL = 'inline';

const INTERPRETERS = new Set(['node', 'python', 'python3', 'bash', 'sh', 'zsh', 'bun', 'deno', 'npx', 'uvx']);
const SHELL_SYNTAX_PREFIX = /^(?:(?:if|case|for|while|until|function)\s|[:[{(!]\s|\[\[\s|[{(])/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
// Flags whose value is inline code, e.g. `bash -lc '...'`, `node -e '...'`, `python -c '...'`.
const SHELL_INLINE_FLAG = /^-[A-Za-z]*c[A-Za-z]*$/;
const INLINE_CODE_FLAGS: Readonly<Record<string, RegExp>> = {
  bash: SHELL_INLINE_FLAG,
  sh: SHELL_INLINE_FLAG,
  zsh: SHELL_INLINE_FLAG,
  python: /^-c$/,
  python3: /^-c$/,
  node: /^(?:-e|-p|--eval|--print)$/,
  bun: /^(?:-e|-p|--eval|--print)$/,
  deno: /^(?:eval)$/,
  npx: /^(?:-c|--call)$/,
};
const RUNNER_SUBCOMMANDS = new Set(['run', 'x', 'exec']);
const SHELL_OPERATORS = new Set([';', '&', '|', '<', '>']);

/** Splits a shell command into words, honouring quotes, until the first unquoted operator. */
export function shellWords(command: string): string[] {
  const words: string[] = [];
  let current = '';
  let inWord = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i] as string;
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && i + 1 < command.length) current += command[++i];
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      inWord = true;
    } else if (ch === '\\' && i + 1 < command.length) {
      current += command[++i];
      inWord = true;
    } else if (/\s/.test(ch)) {
      if (inWord) words.push(current);
      current = '';
      inWord = false;
    } else if (SHELL_OPERATORS.has(ch)) {
      break;
    } else {
      current += ch;
      inWord = true;
    }
  }
  if (inWord) words.push(current);
  return words;
}

function scriptAfterInterpreter(interpreter: string, rest: readonly string[]): string | null {
  for (const word of rest) {
    if (INLINE_CODE_FLAGS[interpreter]?.test(word)) return null;
    if (word.startsWith('-')) continue;
    if ((interpreter === 'bun' || interpreter === 'deno') && RUNNER_SUBCOMMANDS.has(word)) continue;
    return word;
  }
  return null;
}

function displayName(token: string): string {
  return token.includes('/') || token.includes('\\') ? basename(token) : token;
}

/** Picks one human-readable name from a hook handler. Never returns the full command. */
export function hookLabel(handler: { type: string; command?: unknown }): string {
  if (handler.type !== 'command') return handler.type;
  if (typeof handler.command !== 'string') return INLINE_LABEL;
  const command = handler.command.trim();
  if (command.length === 0 || SHELL_SYNTAX_PREFIX.test(command)) return INLINE_LABEL;

  const words = shellWords(command);
  const start = words.findIndex((w) => !ASSIGNMENT.test(w));
  if (start === -1) return INLINE_LABEL;
  const first = words[start] as string;
  const firstName = displayName(first);

  const token = INTERPRETERS.has(firstName)
    ? scriptAfterInterpreter(firstName, words.slice(start + 1))
    : first;
  if (token === null) return INLINE_LABEL;
  const label = displayName(token);
  return label.length > 0 ? label : INLINE_LABEL;
}
