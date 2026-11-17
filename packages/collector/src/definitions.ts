import type { ScanContext } from './context.js';
import { stringField, type RawDefinition } from './items.js';
import type { Agent, Command, Skill, Source } from './types.js';

const MAX_NAME_LENGTH = 120;
const MAX_SHORT_FIELD_LENGTH = 64;

export type UsageLookup = (keys: readonly string[]) => { uses: number; lastUsedAt: string | null };

export function definitionName(def: RawDefinition): string {
  return stringField(def.data, 'name') ?? def.fallbackName;
}

/** Plugin name of a `plugin:<name>` source, null for 'user' and 'builtin'. */
export function pluginOf(source: Source): string | null {
  return source.startsWith('plugin:') ? source.slice('plugin:'.length) : null;
}

/** Keys to look up usage under: plugin items are tried as '<plugin>:<name>' and bare '<name>'. */
export function usageKeys(name: string, source: Source, userNames: ReadonlySet<string>): string[] {
  const plugin = pluginOf(source);
  if (plugin === null) return [name];
  // A bare name owned by a user-level item is not attributed to the plugin item.
  return userNames.has(name) ? [`${plugin}:${name}`] : [`${plugin}:${name}`, name];
}

export function qualifiedName(name: string, source: Source): string {
  const plugin = pluginOf(source);
  return plugin === null ? name : `${plugin}:${name}`;
}

function redactedSource(source: Source, ctx: ScanContext): Source {
  const plugin = pluginOf(source);
  return plugin === null ? source : `plugin:${ctx.redactor.text(plugin, MAX_NAME_LENGTH)}`;
}

export function toSkill(def: RawDefinition, source: Source, usage: ReturnType<UsageLookup>, ctx: ScanContext): Skill {
  return {
    name: ctx.redactor.text(qualifiedName(definitionName(def), source), MAX_NAME_LENGTH),
    description: ctx.redactor.text(stringField(def.data, 'description') ?? ''),
    source: redactedSource(source, ctx),
    uses: usage.uses,
    lastUsedAt: usage.lastUsedAt,
  };
}

function toolList(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((t) => t.trim()).filter(Boolean);
  return null;
}

function mcpServersOf(tools: readonly string[]): string[] {
  const servers = new Set<string>();
  for (const tool of tools) {
    const parts = tool.split('__');
    if (parts[0] === 'mcp' && parts.length >= 2 && (parts[1] ?? '').length > 0) servers.add(parts[1] as string);
  }
  return [...servers].sort();
}

export function toAgent(def: RawDefinition, source: Source, uses: number, ctx: ScanContext): Agent {
  const { redactor } = ctx;
  const tools = toolList(def.data.tools);
  return {
    name: redactor.text(qualifiedName(definitionName(def), source), MAX_NAME_LENGTH),
    description: redactor.text(stringField(def.data, 'description') ?? ''),
    model: redactor.optional(stringField(def.data, 'model'), MAX_SHORT_FIELD_LENGTH),
    effort: redactor.optional(stringField(def.data, 'effort'), MAX_SHORT_FIELD_LENGTH),
    toolCount: tools === null ? null : tools.length,
    mcpServers: mcpServersOf(tools ?? []).map((s) => redactor.text(s, MAX_NAME_LENGTH)),
    source: redactedSource(source, ctx),
    uses,
  };
}

/** An agent that ships with the tool. Listed only when used, so `uses` is at least 1. Name is a constant, not user text. */
export function builtinAgent(name: string, uses: number): Agent {
  return { name, description: '', model: null, effort: null, toolCount: null, mcpServers: [], source: 'builtin', uses };
}

/** Built-ins that were used and are not shadowed by a defined agent of the same name. */
export function usedBuiltinAgents(
  builtins: readonly string[],
  defined: ReadonlySet<string>,
  calls: ReadonlyMap<string, number>,
): Agent[] {
  return builtins
    .filter((name) => !defined.has(name) && (calls.get(name) ?? 0) > 0)
    .map((name) => builtinAgent(name, calls.get(name) ?? 0));
}

export function toCommand(def: RawDefinition, ctx: ScanContext): Command {
  return {
    name: ctx.redactor.text(def.fallbackName, MAX_NAME_LENGTH),
    description: ctx.redactor.text(stringField(def.data, 'description') ?? ''),
  };
}
