import { basename, isRecord } from './fsutil.js';
import { isPublicMcpHost } from './mcpHosts.js';
import type { Redactor } from './redact.js';
import type { McpServer } from './types.js';

const PACKAGE_RUNNERS = new Set(['npx', 'bunx', 'uvx', 'pnpx']);
const PACKAGE_VALUE_FLAGS = new Set(['-p', '--package', '--from', '--with']);
const MAX_FIELD_LENGTH = 120;

/** Claude Code rewrites server names to [A-Za-z0-9_-] when building `mcp__<server>__<tool>`. */
export function normalizeServerName(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, '_');
}

function transportOf(raw: Record<string, unknown>): McpServer['transport'] {
  const t = typeof raw.type === 'string' ? raw.type.toLowerCase() : null;
  if (t === 'stdio' || t === 'http' || t === 'sse') return t;
  if (t === 'streamable-http' || t === 'streamable_http' || t === 'streamablehttp') return 'http';
  if (t !== null) return 'unknown';
  if (typeof raw.url === 'string') return 'http';
  if (typeof raw.command === 'string') return 'stdio';
  return 'unknown';
}

/** Hostname of `url` if it is an allow-listed public MCP service, otherwise null. */
function publicHostOf(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    return isPublicMcpHost(host) ? host : null;
  } catch {
    return null;
  }
}

/** '@scope/pkg@1.2.3' -> '@scope/pkg', 'pkg@latest' -> 'pkg', 'pkg==1.0' -> 'pkg'. Paths/URLs -> null. */
export function stripPackageVersion(spec: string): string | null {
  const s = spec.trim();
  if (s.length === 0 || /^[.~/\\]/.test(s) || s.includes(':')) return null;
  const scoped = s.startsWith('@');
  const at = s.indexOf('@', scoped ? 1 : 0);
  const name = (at > 0 ? s.slice(0, at) : s).split(/[=<>!~[;\s]/)[0] ?? '';
  if (name.length === 0) return null;
  // Unscoped names with '/' are git shorthands (owner/repo); scoped names must have exactly one '/'.
  const slashes = name.split('/').length - 1;
  if (scoped ? slashes !== 1 : slashes !== 0) return null;
  return name;
}

function packageFromArgs(runner: string, args: readonly string[]): string | null {
  const rest = runner === 'pnpm' || runner === 'bun' ? args.slice(1) : args;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] as string;
    const eq = arg.indexOf('=');
    const flag = eq > 0 ? arg.slice(0, eq) : arg;
    if (PACKAGE_VALUE_FLAGS.has(flag)) {
      const value = eq > 0 ? arg.slice(eq + 1) : rest[i + 1];
      return typeof value === 'string' ? stripPackageVersion(value) : null;
    }
    if (arg.startsWith('-')) continue;
    return stripPackageVersion(arg);
  }
  return null;
}

function isPackageRunner(command: string, args: readonly string[]): boolean {
  if (PACKAGE_RUNNERS.has(command)) return true;
  if (command === 'pnpm') return args[0] === 'dlx';
  if (command === 'bun') return args[0] === 'x';
  return false;
}

function stdioFields(raw: Record<string, unknown>): { command?: string; package?: string } {
  if (typeof raw.command !== 'string' || raw.command.trim().length === 0) return {};
  const [head = '', ...inlineArgs] = raw.command.trim().split(/\s+/);
  const command = basename(head);
  const args = [
    ...inlineArgs,
    ...(Array.isArray(raw.args) ? raw.args.filter((a): a is string => typeof a === 'string') : []),
  ];
  const pkg = isPackageRunner(command, args) ? packageFromArgs(command, args) : null;
  return pkg ? { command, package: pkg } : { command };
}

/** Builds an McpServer from a raw config entry using an allow-list of fields. */
export function buildMcpServer(
  name: string,
  raw: unknown,
  scope: McpServer['scope'],
  calls: number,
  redactor: Redactor,
): McpServer {
  const entry = isRecord(raw) ? raw : {};
  const transport = transportOf(entry);
  const base = { name: redactor.text(name, MAX_FIELD_LENGTH), transport, scope };
  if (transport === 'http' || transport === 'sse') {
    const host = publicHostOf(entry.url);
    return { ...base, ...(host ? { host: redactor.text(host, MAX_FIELD_LENGTH) } : {}), calls };
  }
  if (transport === 'stdio') {
    const fields = stdioFields(entry);
    return {
      ...base,
      ...(fields.command ? { command: redactor.text(fields.command, MAX_FIELD_LENGTH) } : {}),
      ...(fields.package ? { package: redactor.text(fields.package, MAX_FIELD_LENGTH) } : {}),
      calls,
    };
  }
  return { ...base, calls };
}
