// Pi settings.json and mcp.json. auth.json, mcp-auth.json and models.json (may hold apiKey) are never opened.
import { isAbsolute, join, resolve } from 'node:path';

import type { ScanContext } from '../context.js';
import { isRecord, readJsonOrNull } from '../fsutil.js';

export const PI_SETTINGS_FILE = 'settings.json';
export const PI_MCP_FILE = 'mcp.json';

async function readObject(path: string, ctx: ScanContext): Promise<Record<string, unknown>> {
  const value = await readJsonOrNull(path, ctx.diag);
  if (value === null) return {};
  if (!isRecord(value)) {
    ctx.diag.warn(path, '최상위가 객체가 아님');
    return {};
  }
  return value;
}

/** `<agent-dir>/settings.json`. Missing -> {}; broken -> warning + {}. */
export async function readPiSettings(ctx: ScanContext): Promise<Record<string, unknown>> {
  return readObject(join(ctx.piAgentDir, PI_SETTINGS_FILE), ctx);
}

/**
 * `mcpServers` of `<agent-dir>/mcp.json`. The whole entry stays in memory only; buildMcpServer exports the transport,
 * an allow-listed host and a package name, never env, headers or args. The project `.pi/mcp.json` is not read.
 */
export async function readPiMcpServers(ctx: ScanContext): Promise<Record<string, unknown>> {
  const config = await readObject(join(ctx.piAgentDir, PI_MCP_FILE), ctx);
  return isRecord(config.mcpServers) ? config.mcpServers : {};
}

/** Strings of a settings array; anything else is dropped. */
export function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim()) : [];
}

/** Pi resolves `~/` against the home directory and relative paths against the file that names them. */
export function resolvePiPath(raw: string, base: string, home: string): string {
  const path = raw.trim();
  if (path === '~') return home;
  if (path.startsWith('~/')) return join(home, path.slice(2));
  return isAbsolute(path) ? resolve(path) : resolve(base, path);
}

/**
 * Session roots to scan: the configured one ($PI_CODING_AGENT_SESSION_DIR, else settings `sessionDir`) and the
 * default `<agent-dir>/sessions`, which still holds sessions written before the setting changed. A relative
 * `sessionDir` resolves from whatever directory Pi was started in, so it cannot be found and is skipped with a warning.
 */
export function piSessionRoots(settings: Record<string, unknown>, ctx: ScanContext): string[] {
  const fallback = join(ctx.piAgentDir, 'sessions');
  const configured = ctx.piSessionDir ?? (typeof settings.sessionDir === 'string' ? settings.sessionDir.trim() : '');
  if (configured.length === 0) return [fallback];
  if (!isAbsolute(configured) && !configured.startsWith('~')) {
    ctx.diag.warn(join(ctx.piAgentDir, PI_SETTINGS_FILE), 'sessionDir 가 상대 경로라 기본 세션 폴더만 읽음');
    return [fallback];
  }
  const custom = resolvePiPath(configured, ctx.piAgentDir, ctx.home);
  return custom === fallback ? [fallback] : [custom, fallback];
}
