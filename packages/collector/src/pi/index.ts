// Pi (pi.dev coding agent): <agent-dir> = $PI_CODING_AGENT_DIR or ~/.pi/agent (docs/collector-spec.md 「Pi」).
import { join } from 'node:path';

import type { ScanContext } from '../context.js';
import { toCommand } from '../definitions.js';
import { describeError } from '../diagnostics.js';
import { compareStrings, isRecord, pathExists, sortByName } from '../fsutil.js';
import { readFlatDefinitions, readInstructions } from '../items.js';
import { buildMcpServer } from '../mcp.js';
import type { Instructions, McpServer, PiSource } from '../types.js';
import { OTHER_MODEL } from '../usage/lines.js';
import { scanPiSessions, type PiSessionScan } from '../usage/pi.js';
import { piSessionRoots, readPiMcpServers, readPiSettings } from './config.js';
import { readPiPackages, toPiPlugins } from './packages.js';
import { collectPiSkills } from './skills.js';

const MAX_SHORT_FIELD_LENGTH = 64;
const MCP_TOOL_PREFIX = 'mcp__';
/** resource-loader.ts loadContextFileFromDir: the first of these that is a file is the agent-dir instructions. */
const INSTRUCTION_FILES = ['AGENTS.override.md', 'AGENTS.md', 'AGENTS.MD', 'CLAUDE.md', 'CLAUDE.MD'];

async function scanUsage(settings: Record<string, unknown>, ctx: ScanContext): Promise<PiSessionScan | null> {
  const roots = piSessionRoots(settings, ctx);
  try {
    return await scanPiSessions(roots, ctx.home, ctx.diag, ctx.onProgress?.('Pi 세션 읽는 중'));
  } catch (err) {
    ctx.diag.warn(roots[0] ?? ctx.piAgentDir, `세션 집계 실패 (${describeError(err)})`);
    return null;
  }
}

/** Pi names MCP tools `mcp__<server>__<tool>` with every character but [A-Za-z0-9_] turned into `_`. */
function toolServerKey(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_');
}

/** Calls per configured server. The longest matching server key wins, so a server name may itself contain `__`. */
function callsByServer(names: readonly string[], toolCalls: ReadonlyMap<string, number>): Map<string, number> {
  const keys = names.map((name) => [name, `${MCP_TOOL_PREFIX}${toolServerKey(name)}__`] as const).sort((a, b) => b[1].length - a[1].length);
  const out = new Map<string, number>();
  for (const [tool, n] of toolCalls) {
    const server = keys.find(([, prefix]) => tool.startsWith(prefix))?.[0];
    if (server !== undefined) out.set(server, (out.get(server) ?? 0) + n);
  }
  return out;
}

/** `enabled: false` servers are left out, as for Codex. Calls through codemode and direct calls both count. */
function collectMcp(servers: Record<string, unknown>, toolCalls: ReadonlyMap<string, number>, ctx: ScanContext): McpServer[] {
  const enabled = Object.entries(servers).filter(([, raw]) => !(isRecord(raw) && raw.enabled === false));
  const calls = callsByServer(enabled.map(([name]) => name), toolCalls);
  return sortByName(enabled.map(([name, raw]) => buildMcpServer(name, raw, 'user', calls.get(name) ?? 0, ctx.redactor)));
}

async function readPiInstructions(ctx: ScanContext): Promise<Instructions> {
  for (const file of INSTRUCTION_FILES) {
    const found = await readInstructions(join(ctx.piAgentDir, file), ctx.diag);
    if (found.present) return found;
  }
  return { present: false, lines: 0, bytes: 0 };
}

/** Most assistant messages wins (ties by name); ids that failed validation never become the model. */
function topModel(counts: ReadonlyMap<string, number> | undefined): string | null {
  const best = [...(counts ?? [])].filter(([m, n]) => m !== OTHER_MODEL && n > 0).sort((a, b) => b[1] - a[1] || compareStrings(a[0], b[0]))[0];
  return best?.[0] ?? null;
}

export type PiResult = {
  source: PiSource | null;
  /** Session dates for the cross-tool activity union. null when no session scan ran. */
  days: ReadonlySet<string> | null;
};

/** source is null when the agent dir does not exist. auth.json, mcp-auth.json and models.json are never opened. */
export async function collectPi(ctx: ScanContext, options: { usage: boolean }): Promise<PiResult> {
  const agentDir = ctx.piAgentDir;
  if (!(await pathExists(agentDir))) return { source: null, days: null };

  const settings = await readPiSettings(ctx);
  const scan = options.usage ? await scanUsage(settings, ctx) : null;
  const packages = await readPiPackages(settings, ctx);
  const refs = scan ? { paths: scan.skillRefs, names: scan.skillNameRefs } : null;
  const { skills, pluginUses } = await collectPiSkills(settings, packages, refs, ctx);
  const prompts = await readFlatDefinitions(join(agentDir, 'prompts'), ctx.diag);

  const source: PiSource = {
    // What the user ran beats the configured default.
    model: ctx.redactor.optional(topModel(scan?.modelCounts) ?? settings.defaultModel, MAX_SHORT_FIELD_LENGTH),
    mcpServers: collectMcp(await readPiMcpServers(ctx), scan?.mcpToolCalls ?? new Map(), ctx),
    skills,
    plugins: toPiPlugins(packages, pluginUses, ctx),
    commands: sortByName(prompts.map((def) => toCommand(def, ctx))),
    instructions: await readPiInstructions(ctx),
    usage: scan?.usage ?? null,
  };
  return { source, days: scan?.days ?? null };
}
