import { join } from 'node:path';

import type { ScanContext } from '../context.js';
import { toCommand } from '../definitions.js';
import { describeError } from '../diagnostics.js';
import { compareStrings, isRecord, pathExists, sortByName } from '../fsutil.js';
import { countFiles, readFlatDefinitions, readInstructions } from '../items.js';
import { buildMcpServer } from '../mcp.js';
import type { CodexSource, Instructions, McpServer } from '../types.js';
import { NO_EFFORT, scanCodexSessions, type CodexSessionScan } from '../usage/codex.js';
import { collectCodexAgents } from './agents.js';
import { readCodexConfig } from './config.js';
import { collectCodexHooks } from './hooks.js';
import { readCodexPlugins, toCodexPlugins } from './plugins.js';
import { collectCodexSkills } from './skills.js';

const MAX_SHORT_FIELD_LENGTH = 64;

async function scanUsage(codexHome: string, ctx: ScanContext): Promise<CodexSessionScan | null> {
  try {
    return await scanCodexSessions(codexHome, ctx.diag, ctx.onProgress?.('Codex 세션 읽는 중'));
  } catch (err) {
    ctx.diag.warn(join(codexHome, 'sessions'), `세션 집계 실패 (${describeError(err)})`);
    return null;
  }
}

/** `[mcp_servers.<id>] enabled = false` servers are left out. Failed calls still count, as on the Claude side. */
function collectMcp(config: Record<string, unknown>, calls: ReadonlyMap<string, number>, ctx: ScanContext): McpServer[] {
  const servers = isRecord(config.mcp_servers) ? config.mcp_servers : {};
  return sortByName(
    Object.entries(servers)
      .filter(([, raw]) => !(isRecord(raw) && raw.enabled === false))
      .map(([name, raw]) => buildMcpServer(name, raw, 'user', calls.get(name) ?? 0, ctx.redactor)),
  );
}

/** AGENTS.override.md wins when it has content, as in Codex. */
async function readCodexInstructions(ctx: ScanContext): Promise<Instructions> {
  const override = await readInstructions(join(ctx.codexHome, 'AGENTS.override.md'), ctx.diag);
  return override.present && override.bytes > 0 ? override : readInstructions(join(ctx.codexHome, 'AGENTS.md'), ctx.diag);
}

/** Most turns wins (ties by name); its most frequent effort comes along. null when no turn_context was seen. */
export function mostUsedModel(modelTurns: ReadonlyMap<string, ReadonlyMap<string, number>>): { model: string; effort: string | null } | null {
  const total = (m: ReadonlyMap<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);
  const best = [...modelTurns].sort((a, b) => total(b[1]) - total(a[1]) || compareStrings(a[0], b[0]))[0];
  if (best === undefined) return null;
  const effort = [...best[1]].filter(([e]) => e !== NO_EFFORT).sort((a, b) => b[1] - a[1] || compareStrings(a[0], b[0]))[0];
  return { model: best[0], effort: effort?.[0] ?? null };
}

export type CodexResult = {
  source: CodexSource | null;
  /** Session dates for the cross-tool activity union. null when no session scan ran. */
  days: ReadonlySet<string> | null;
};

/**
 * source is null when the Codex home ($CODEX_HOME or ~/.codex) does not exist. The plan comes from the session scan
 * only (auth.json is never opened), so it is null without usage or with `plan: false`.
 */
export async function collectCodex(ctx: ScanContext, options: { usage: boolean; plan: boolean }): Promise<CodexResult> {
  const { codexHome } = ctx;
  if (!(await pathExists(codexHome))) return { source: null, days: null };

  const config = await readCodexConfig(join(codexHome, 'config.toml'), ctx.diag);
  const scan = options.usage ? await scanUsage(codexHome, ctx) : null;
  const plugins = await readCodexPlugins(config, ctx);
  const { skills, pluginUses } = await collectCodexSkills(config, plugins, scan?.skillRefs ?? null, ctx);
  const prompts = await readFlatDefinitions(join(codexHome, 'prompts'), ctx.diag);
  // What the user ran in interactive sessions beats the configured default; exec and subagent turns are a fallback.
  const used = scan ? (mostUsedModel(scan.interactiveModelTurns) ?? mostUsedModel(scan.modelTurns)) : null;

  const source: CodexSource = {
    model: ctx.redactor.optional(used?.model ?? config.model, MAX_SHORT_FIELD_LENGTH),
    reasoningEffort: ctx.redactor.optional(used?.effort ?? config.model_reasoning_effort, MAX_SHORT_FIELD_LENGTH),
    mcpServers: collectMcp(config, scan?.mcpCalls ?? new Map(), ctx),
    skills,
    hooks: await collectCodexHooks(config, plugins, ctx),
    commands: sortByName(prompts.map((def) => toCommand(def, ctx))),
    instructions: await readCodexInstructions(ctx),
    rulesFiles: await countFiles(join(codexHome, 'rules'), ctx.diag),
    agents: await collectCodexAgents(config, scan?.roleCalls ?? null, ctx),
    plugins: toCodexPlugins(plugins, pluginUses, ctx),
    plan: options.plan ? (scan?.plan ?? null) : null,
    usage: scan?.usage ?? null,
  };
  return { source, days: scan?.days ?? null };
}
