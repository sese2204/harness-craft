import { join } from 'node:path';

import type { ScanContext } from '../context.js';
import { toCommand, toSkill } from '../definitions.js';
import { describeError } from '../diagnostics.js';
import { isRecord, pathExists, readJsonOrNull, sortByName } from '../fsutil.js';
import { parseHooks } from '../hooks.js';
import { countFiles, readFlatDefinitions, readInstructions, readSkillDefinitions } from '../items.js';
import { buildMcpServer } from '../mcp.js';
import type { CodexSource, Hook, McpServer } from '../types.js';
import { scanCodexSessions, type CodexSessionScan } from '../usage/codex.js';
import { readCodexConfig } from './config.js';

const MAX_SHORT_FIELD_LENGTH = 64;
const NO_USAGE = { uses: 0, lastUsedAt: null };

async function scanUsage(codexDir: string, ctx: ScanContext): Promise<CodexSessionScan | null> {
  try {
    return await scanCodexSessions(codexDir, ctx.diag, ctx.onProgress?.('Codex 세션 읽는 중'));
  } catch (err) {
    ctx.diag.warn(join(codexDir, 'sessions'), `세션 집계 실패 (${describeError(err)})`);
    return null;
  }
}

function collectMcp(config: Record<string, unknown>, calls: ReadonlyMap<string, number>, ctx: ScanContext): McpServer[] {
  const servers = isRecord(config.mcp_servers) ? config.mcp_servers : {};
  return sortByName(
    Object.entries(servers).map(([name, raw]) => buildMcpServer(name, raw, 'user', calls.get(name) ?? 0, ctx.redactor)),
  );
}

async function collectHooks(path: string, ctx: ScanContext): Promise<Hook[]> {
  const json = await readJsonOrNull(path, ctx.diag);
  if (json === null) return [];
  if (!isRecord(json)) {
    ctx.diag.warn(path, '최상위가 객체가 아님');
    return [];
  }
  return parseHooks(json.hooks, path, ctx.redactor, ctx.diag);
}

/** Returns null when ~/.codex does not exist. */
export async function collectCodex(ctx: ScanContext, options: { usage: boolean }): Promise<CodexSource | null> {
  const codexDir = join(ctx.home, '.codex');
  if (!(await pathExists(codexDir))) return null;

  const config = await readCodexConfig(join(codexDir, 'config.toml'), ctx.diag);
  const scan = options.usage ? await scanUsage(codexDir, ctx) : null;
  const skills = await readSkillDefinitions(join(codexDir, 'skills'), ctx.diag);
  const prompts = await readFlatDefinitions(join(codexDir, 'prompts'), ctx.diag);

  return {
    model: ctx.redactor.optional(config.model, MAX_SHORT_FIELD_LENGTH),
    reasoningEffort: ctx.redactor.optional(config.model_reasoning_effort, MAX_SHORT_FIELD_LENGTH),
    mcpServers: collectMcp(config, scan?.mcpCalls ?? new Map(), ctx),
    skills: sortByName(skills.map((def) => toSkill(def, 'user', NO_USAGE, ctx))),
    hooks: await collectHooks(join(codexDir, 'hooks.json'), ctx),
    commands: sortByName(prompts.map((def) => toCommand(def, ctx))),
    instructions: await readInstructions(join(codexDir, 'AGENTS.md'), ctx.diag),
    rulesFiles: await countFiles(join(codexDir, 'rules'), ctx.diag),
    usage: scan?.usage ?? null,
  };
}
