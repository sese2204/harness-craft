// What goes into the shared HTML: hidden items removed, descriptions blanked unless asked for (docs/share-spec.md).
import type { Agent, ClaudeCodeSource, CodexSource, HarnessProfile, Hook, McpServer, PiSource, Source } from './types.js';

export interface ShareOptions {
  /** Case-insensitive globs where `*` matches any run of characters. */
  hide: readonly string[];
  descriptions: boolean;
}

export interface PreparedShare {
  profile: HarnessProfile;
  /** Items removed by `hide` (MCP, skills, agents, hooks, plugins, commands, and items of hidden plugins). */
  hidden: number;
}

type NameMatcher = (name: string) => boolean;

function globToRegExp(glob: string): RegExp {
  const body = glob
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}$`, 'i');
}

export function globMatcher(globs: readonly string[]): NameMatcher {
  const patterns = globs.map(globToRegExp);
  return (name) => patterns.some((p) => p.test(name));
}

interface Filter {
  isHidden: NameMatcher;
  hiddenPlugins: ReadonlySet<string>;
  descriptions: boolean;
}

function fromHiddenPlugin(source: Source, filter: Filter): boolean {
  return source.startsWith('plugin:') && filter.hiddenPlugins.has(source.slice('plugin:'.length));
}

function keep<T extends { name: string }>(items: readonly T[], filter: Filter, extra?: (item: T) => boolean): T[] {
  return items.filter((item) => !filter.isHidden(item.name) && !(extra?.(item) ?? false));
}

function shareMcp(servers: readonly McpServer[], filter: Filter): McpServer[] {
  return keep(servers, filter).map((s) => {
    if (filter.descriptions) return { ...s };
    // package/host/command is what the sheet shows as an MCP description.
    const { package: _pkg, host: _host, command: _command, ...rest } = s;
    return rest;
  });
}

function shareHooks(hooks: readonly Hook[], filter: Filter): Hook[] {
  // matcher 는 시트가 쓰지 않고 mcp__<서버>__* 처럼 숨긴 이름을 담을 수 있어 공유본에서는 비운다.
  return hooks.filter((h) => !filter.isHidden(h.label) && !filter.isHidden(h.event)).map((h) => ({ ...h, matcher: null }));
}

function described<T extends { description: string }>(item: T, filter: Filter): T {
  return { ...item, description: filter.descriptions ? item.description : '' };
}

function shareAgents(agents: readonly Agent[], filter: Filter): Agent[] {
  return keep(agents, filter, (a) => fromHiddenPlugin(a.source, filter)).map((a) => ({
    ...described(a, filter),
    mcpServers: a.mcpServers.filter((name) => !filter.isHidden(name)),
  }));
}

function shareClaude(c: ClaudeCodeSource, filter: Filter): ClaudeCodeSource {
  return {
    ...c,
    mcpServers: shareMcp(c.mcpServers, filter),
    skills: keep(c.skills, filter, (s) => fromHiddenPlugin(s.source, filter)).map((s) => described(s, filter)),
    agents: shareAgents(c.agents, filter),
    hooks: shareHooks(c.hooks, filter),
    plugins: keep(c.plugins, filter).map((p) => ({ ...p })),
    commands: keep(c.commands, filter).map((cmd) => described(cmd, filter)),
  };
}

function shareCodex(c: CodexSource, filter: Filter): CodexSource {
  return {
    ...c,
    mcpServers: shareMcp(c.mcpServers, filter),
    skills: keep(c.skills, filter, (s) => fromHiddenPlugin(s.source, filter)).map((s) => described(s, filter)),
    hooks: shareHooks(c.hooks, filter),
    commands: keep(c.commands, filter).map((cmd) => described(cmd, filter)),
    // Older profiles have no Codex agents or plugins; keep the keys absent rather than inventing empty lists.
    ...(c.agents ? { agents: shareAgents(c.agents, filter) } : {}),
    ...(c.plugins ? { plugins: keep(c.plugins, filter).map((p) => ({ ...p })) } : {}),
  };
}

function sharePi(p: PiSource, filter: Filter): PiSource {
  return {
    ...p,
    mcpServers: shareMcp(p.mcpServers, filter),
    skills: keep(p.skills, filter, (s) => fromHiddenPlugin(s.source, filter)).map((s) => described(s, filter)),
    plugins: keep(p.plugins, filter).map((plugin) => ({ ...plugin })),
    commands: keep(p.commands, filter).map((cmd) => described(cmd, filter)),
  };
}

function itemCount(profile: HarnessProfile): number {
  const c = profile.claudeCode;
  const x = profile.codex;
  const p = profile.pi;
  const claude = c ? c.mcpServers.length + c.skills.length + c.agents.length + c.hooks.length + c.plugins.length + c.commands.length : 0;
  const codex = x
    ? x.mcpServers.length + x.skills.length + (x.agents?.length ?? 0) + (x.plugins?.length ?? 0) + x.hooks.length + x.commands.length
    : 0;
  const pi = p ? p.mcpServers.length + p.skills.length + p.plugins.length + p.commands.length : 0;
  return claude + codex + pi;
}

/**
 * Returns a new profile for the shared file. Hidden items are removed from the arrays (not just flagged), hidden MCP
 * names are dropped from agents' mcpServers, a hidden plugin takes its skills and agents with it, and warnings
 * (diagnostics that can name files and items) are cleared. The input is not modified.
 */
export function prepareShareProfile(profile: HarnessProfile, options: ShareOptions): PreparedShare {
  const isHidden = globMatcher(options.hide);
  // A hidden plugin name takes that plugin's skills and agents with it, in any tool.
  const plugins = [...(profile.claudeCode?.plugins ?? []), ...(profile.codex?.plugins ?? []), ...(profile.pi?.plugins ?? [])];
  const filter: Filter = {
    isHidden,
    hiddenPlugins: new Set(plugins.filter((p) => isHidden(p.name)).map((p) => p.name)),
    descriptions: options.descriptions,
  };
  const shared: HarnessProfile = {
    ...profile,
    collector: { ...profile.collector },
    claudeCode: profile.claudeCode ? shareClaude(profile.claudeCode, filter) : null,
    codex: profile.codex ? shareCodex(profile.codex, filter) : null,
    // Older profiles have no pi key; keep it absent rather than adding null.
    ...(profile.pi !== undefined ? { pi: profile.pi && sharePi(profile.pi, filter) } : {}),
    // Counts and first/last day only, so it goes through unchanged.
    ...(profile.activity !== undefined ? { activity: profile.activity && { ...profile.activity } } : {}),
    redactions: { ...profile.redactions },
    warnings: [],
  };
  return { profile: shared, hidden: itemCount(profile) - itemCount(shared) };
}
