import type { ScanContext } from './context.js';
import { stringField, type RawDefinition } from './items.js';
import type { Agent, Command, Skill, Source } from './types.js';

const MAX_NAME_LENGTH = 120;
const MAX_SHORT_FIELD_LENGTH = 64;

export type UsageLookup = (keys: readonly string[]) => { uses: number; lastUsedAt: string | null };

export function definitionName(def: RawDefinition): string {
  return stringField(def.data, 'name') ?? def.fallbackName;
}

/** Keys to look up usage under: plugin items are tried as '<plugin>:<name>' and bare '<name>'. */
export function usageKeys(name: string, source: Source, userNames: ReadonlySet<string>): string[] {
  if (source === 'user') return [name];
  const plugin = source.slice('plugin:'.length);
  // A bare name owned by a user-level item is not attributed to the plugin item.
  return userNames.has(name) ? [`${plugin}:${name}`] : [`${plugin}:${name}`, name];
}

export function qualifiedName(name: string, source: Source): string {
  return source === 'user' ? name : `${source.slice('plugin:'.length)}:${name}`;
}

export function toSkill(def: RawDefinition, source: Source, usage: ReturnType<UsageLookup>, ctx: ScanContext): Skill {
  return {
    name: ctx.redactor.text(qualifiedName(definitionName(def), source), MAX_NAME_LENGTH),
    description: ctx.redactor.text(stringField(def.data, 'description') ?? ''),
    source: source === 'user' ? 'user' : `plugin:${ctx.redactor.text(source.slice('plugin:'.length), MAX_NAME_LENGTH)}`,
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
    source: source === 'user' ? 'user' : `plugin:${redactor.text(source.slice('plugin:'.length), MAX_NAME_LENGTH)}`,
    uses,
  };
}

export function toCommand(def: RawDefinition, ctx: ScanContext): Command {
  return {
    name: ctx.redactor.text(def.fallbackName, MAX_NAME_LENGTH),
    description: ctx.redactor.text(stringField(def.data, 'description') ?? ''),
  };
}
