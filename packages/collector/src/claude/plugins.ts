import { join } from 'node:path';

import type { ScanContext } from '../context.js';
import { isRecord, readJsonOrNull, sortByName } from '../fsutil.js';
import type { Plugin } from '../types.js';
import { numberField, recordField } from './config.js';

const MAX_FIELD_LENGTH = 120;

export type InstalledPlugin = { key: string; name: string; marketplace: string; installPath: string | null; version: string | null };

export function splitPluginKey(key: string): { name: string; marketplace: string } {
  const at = key.lastIndexOf('@');
  return at > 0 ? { name: key.slice(0, at), marketplace: key.slice(at + 1) } : { name: key, marketplace: '' };
}

export async function readInstalledPlugins(claudeDir: string, ctx: ScanContext): Promise<InstalledPlugin[]> {
  const path = join(claudeDir, 'plugins', 'installed_plugins.json');
  const json = await readJsonOrNull(path, ctx.diag);
  if (json === null) return [];
  const plugins = isRecord(json) ? json.plugins : undefined;
  if (!isRecord(plugins)) {
    ctx.diag.warn(path, 'plugins 필드가 없거나 객체가 아님');
    return [];
  }
  return Object.entries(plugins)
    .map(([key, installs]) => {
      const first: unknown = Array.isArray(installs) ? installs[0] : undefined;
      const install = isRecord(first) ? first : {};
      return {
        key,
        ...splitPluginKey(key),
        installPath: typeof install.installPath === 'string' ? install.installPath : null,
        version: typeof install.version === 'string' ? install.version : null,
      };
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export function toPlugins(
  installed: readonly InstalledPlugin[],
  settings: Record<string, unknown>,
  claudeJson: Record<string, unknown>,
  ctx: ScanContext,
): Plugin[] {
  const enabled = recordField(settings, 'enabledPlugins');
  const usage = recordField(claudeJson, 'pluginUsage');
  return sortByName(
    installed.map((p) => ({
      name: ctx.redactor.text(p.name, MAX_FIELD_LENGTH),
      marketplace: ctx.redactor.text(p.marketplace, MAX_FIELD_LENGTH),
      version: ctx.redactor.optional(p.version, MAX_FIELD_LENGTH),
      enabled: enabled[p.key] === true,
      uses: numberField(recordField(usage, p.key), 'usageCount') ?? 0,
    })),
  );
}
