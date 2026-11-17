// Codex custom agents (subagents): ~/.codex/agents/*.toml and [agents.<role>] tables in config.toml (docs/collector-spec.md).
import { realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { ScanContext } from '../context.js';
import { usedBuiltinAgents } from '../definitions.js';
import { describeError } from '../diagnostics.js';
import { isRecord, listEntries, sortByName } from '../fsutil.js';
import { stringField } from '../items.js';
import type { Agent } from '../types.js';
import { readTomlFile } from './config.js';

const MAX_NAME_LENGTH = 120;
const MAX_SHORT_FIELD_LENGTH = 64;
const AGENT_FILE_SUFFIX = '.toml';

/** Agents that ship with Codex. Shown only when used. */
export const CODEX_BUILTIN_AGENTS: readonly string[] = ['default', 'worker', 'explorer'];

/** Unredacted fields picked from one definition. developer_instructions is never read into this. */
type RawCodexAgent = { name: string; description: string | null; model: string | null; effort: string | null };

function pick(name: string, description: string | null, data: Record<string, unknown> | null): RawCodexAgent {
  return {
    name,
    description,
    model: data ? stringField(data, 'model') : null,
    effort: data ? stringField(data, 'model_reasoning_effort') : null,
  };
}

/** `~/.codex/agents/*.toml`, one agent per file. The `name` key wins over the file name. */
async function readAgentFiles(agentsDir: string, ctx: ScanContext): Promise<RawCodexAgent[]> {
  const out: RawCodexAgent[] = [];
  for (const file of await listEntries(agentsDir, 'file', ctx.diag)) {
    if (!file.endsWith(AGENT_FILE_SUFFIX)) continue;
    const data = await readTomlFile(join(agentsDir, file), ctx.diag);
    if (data === null) continue;
    const name = stringField(data, 'name') ?? file.slice(0, -AGENT_FILE_SUFFIX.length);
    out.push(pick(name, stringField(data, 'description'), data));
  }
  return out;
}

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel.split(sep)[0] !== '..');
}

/**
 * Reads a role's config_file only when it resolves inside ~/.codex, before and after following symlinks.
 * Relative paths are taken from the Codex home (where config.toml lives); `~/` is the home directory.
 */
async function readRoleFile(role: string, value: string, configPath: string, ctx: ScanContext): Promise<Record<string, unknown> | null> {
  const codexDir = ctx.codexHome;
  const target = value.startsWith('~/') ? join(ctx.home, value.slice(2)) : resolve(codexDir, value);
  const outside = `[agents.${role}] config_file 이 ~/.codex 밖을 가리켜 읽지 않음`;
  if (!isInside(codexDir, target)) {
    ctx.diag.warn(configPath, outside);
    return null;
  }
  let real: string;
  let realRoot: string;
  try {
    [real, realRoot] = await Promise.all([realpath(target), realpath(codexDir)]);
  } catch (err) {
    ctx.diag.warn(configPath, `[agents.${role}] config_file 을 읽지 못함 (${describeError(err)})`);
    return null;
  }
  if (!isInside(realRoot, real)) {
    ctx.diag.warn(configPath, outside);
    return null;
  }
  return readTomlFile(real, ctx.diag);
}

/** `[agents.<role>]` sub-tables. Scalar keys under [agents] (max_threads, enabled, …) are settings, not roles. */
async function readRoleTables(config: Record<string, unknown>, configPath: string, ctx: ScanContext): Promise<RawCodexAgent[]> {
  const agents = isRecord(config.agents) ? config.agents : {};
  const out: RawCodexAgent[] = [];
  for (const [role, table] of Object.entries(agents)) {
    if (!isRecord(table)) continue;
    const file = stringField(table, 'config_file');
    const data = file === null ? null : await readRoleFile(role, file, configPath, ctx);
    out.push(pick(role, stringField(table, 'description') ?? (data ? stringField(data, 'description') : null), data));
  }
  return out;
}

function toCodexAgent(raw: RawCodexAgent, uses: number, ctx: ScanContext): Agent {
  const { redactor } = ctx;
  return {
    name: redactor.text(raw.name, MAX_NAME_LENGTH),
    description: redactor.text(raw.description ?? ''),
    model: redactor.optional(raw.model, MAX_SHORT_FIELD_LENGTH),
    effort: redactor.optional(raw.effort, MAX_SHORT_FIELD_LENGTH),
    toolCount: null,
    mcpServers: [],
    source: 'user',
    uses,
  };
}

/**
 * Custom agents (standalone files win over role tables of the same name) plus built-ins that were used.
 * `roleCalls` is null without a session scan: uses are 0 and no built-in is listed.
 */
export async function collectCodexAgents(
  config: Record<string, unknown>,
  roleCalls: ReadonlyMap<string, number> | null,
  ctx: ScanContext,
): Promise<Agent[]> {
  const codexDir = ctx.codexHome;
  const byName = new Map<string, RawCodexAgent>();
  for (const raw of await readRoleTables(config, join(codexDir, 'config.toml'), ctx)) byName.set(raw.name, raw);
  for (const raw of await readAgentFiles(join(codexDir, 'agents'), ctx)) byName.set(raw.name, raw);
  const calls = roleCalls ?? new Map<string, number>();
  const defined = [...byName.values()].map((raw) => toCodexAgent(raw, calls.get(raw.name) ?? 0, ctx));
  return sortByName([...defined, ...usedBuiltinAgents(CODEX_BUILTIN_AGENTS, new Set(byName.keys()), calls)]);
}
