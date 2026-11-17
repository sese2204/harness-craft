// Codex hooks: hooks.json, inline [hooks.<Event>] in config.toml and enabled plugins' hooks/hooks.json (docs/collector-spec.md).
import { join } from 'node:path';

import type { ScanContext } from '../context.js';
import { isRecord, readJsonOrNull } from '../fsutil.js';
import { compareHooks, parseHooks } from '../hooks.js';
import type { Hook } from '../types.js';
import type { CodexPluginInstall } from './plugins.js';

/** `[hooks.state]` holds per-handler trust/enable flags, not handlers. */
const STATE_KEY = 'state';

type HookState = Readonly<Record<string, unknown>>;

/** `[features] hooks` (or its deprecated alias `codex_hooks`) = false turns every hook off. */
function hooksEnabled(config: Record<string, unknown>): boolean {
  const features = isRecord(config.features) ? config.features : {};
  const flag = typeof features.hooks === 'boolean' ? features.hooks : features.codex_hooks;
  return flag !== false;
}

/** PreToolUse -> pre_tool_use, as in hooks.state keys. */
function snakeEvent(event: string): string {
  return event.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/**
 * Returns a copy without handlers that `[hooks.state."<file>:<event>:<group>:<handler>"] enabled = false` turns off.
 * The key format was checked against hooks.json entries; config.toml and plugin files use the same scheme as a guess.
 */
export function withoutDisabled(hooks: unknown, file: string, state: HookState): unknown {
  if (!isRecord(hooks)) return hooks;
  const disabled = (event: string, g: number, h: number): boolean => {
    const entry = state[`${file}:${snakeEvent(event)}:${g}:${h}`];
    return isRecord(entry) && entry.enabled === false;
  };
  return Object.fromEntries(
    Object.entries(hooks).map(([event, groups]) => [
      event,
      Array.isArray(groups)
        ? groups.map((group: unknown, g) =>
            isRecord(group) && Array.isArray(group.hooks)
              ? { ...group, hooks: group.hooks.filter((_: unknown, h: number) => !disabled(event, g, h)) }
              : group,
          )
        : groups,
    ]),
  );
}

async function readHooksJson(path: string, state: HookState, ctx: ScanContext): Promise<Hook[]> {
  const json = await readJsonOrNull(path, ctx.diag);
  if (json === null) return [];
  if (!isRecord(json)) {
    ctx.diag.warn(path, '최상위가 객체가 아님');
    return [];
  }
  return parseHooks(withoutDisabled(json.hooks, path, state), path, ctx.redactor, ctx.diag);
}

export async function collectCodexHooks(
  config: Record<string, unknown>,
  plugins: readonly CodexPluginInstall[],
  ctx: ScanContext,
): Promise<Hook[]> {
  if (!hooksEnabled(config)) return [];
  const configPath = join(ctx.codexHome, 'config.toml');
  const table = isRecord(config.hooks) ? config.hooks : {};
  const state: HookState = isRecord(table[STATE_KEY]) ? table[STATE_KEY] : {};
  const inline = Object.fromEntries(Object.entries(table).filter(([key]) => key !== STATE_KEY));
  const lists = [
    await readHooksJson(join(ctx.codexHome, 'hooks.json'), state, ctx),
    parseHooks(withoutDisabled(inline, configPath, state), configPath, ctx.redactor, ctx.diag),
  ];
  for (const plugin of plugins) if (plugin.enabled) lists.push(await readHooksJson(plugin.hooksFile, state, ctx));
  return lists.flat().sort(compareHooks);
}
