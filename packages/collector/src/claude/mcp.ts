import type { ScanContext } from '../context.js';
import { sortByName } from '../fsutil.js';
import { buildMcpServer, normalizeServerName } from '../mcp.js';
import type { McpServer } from '../types.js';
import { recordField } from './config.js';

/**
 * User scope = ~/.claude.json mcpServers; project scope = projects[*].mcpServers, deduplicated by name.
 * A project server whose name is already a user server is dropped. Project paths are never exported.
 */
export function collectClaudeMcp(
  claudeJson: Record<string, unknown>,
  calls: ReadonlyMap<string, number>,
  ctx: ScanContext,
): McpServer[] {
  const callsOf = (name: string): number => calls.get(normalizeServerName(name)) ?? 0;
  const user = recordField(claudeJson, 'mcpServers');
  const project = new Map<string, unknown>();
  for (const projectEntry of Object.values(recordField(claudeJson, 'projects'))) {
    if (typeof projectEntry !== 'object' || projectEntry === null) continue;
    const servers = recordField(projectEntry as Record<string, unknown>, 'mcpServers');
    for (const [name, raw] of Object.entries(servers)) {
      if (!(name in user) && !project.has(name)) project.set(name, raw);
    }
  }
  return sortByName([
    ...Object.entries(user).map(([name, raw]) => buildMcpServer(name, raw, 'user', callsOf(name), ctx.redactor)),
    ...[...project].map(([name, raw]) => buildMcpServer(name, raw, 'project', callsOf(name), ctx.redactor)),
  ]);
}
