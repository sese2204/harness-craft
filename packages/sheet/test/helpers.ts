import type { Agent, ClaudeCodeSource, CodexSource, HarnessProfile, Hook, McpServer, PiSource, Skill } from '@harness-craft/schema';

import { DEFAULT_VISIBILITY, type Visibility } from '../src/index.js';

export const mcp = (name: string, calls: number, extra: Partial<McpServer> = {}): McpServer => ({
  name, transport: 'stdio', scope: 'user', calls, ...extra,
});

export const skill = (name: string, uses: number, extra: Partial<Skill> = {}): Skill => ({
  name, description: `${name} 설명`, source: 'user', uses, lastUsedAt: null, ...extra,
});

export const agent = (name: string, uses: number, extra: Partial<Agent> = {}): Agent => ({
  name, description: `${name} 담당`, model: 'opus', effort: null, toolCount: null, mcpServers: [], source: 'user', uses, ...extra,
});

export const hook = (event: string, label = 'inline'): Hook => ({ event, matcher: null, type: 'command', label });

export function claudeSource(extra: Partial<ClaudeCodeSource> = {}): ClaudeCodeSource {
  return {
    model: null, since: null, startups: null, mcpServers: [], skills: [], agents: [], hooks: [], plugins: [], commands: [],
    instructions: { present: false, lines: 0, bytes: 0 },
    usage: {
      sessions: 0, subagentRuns: 0, projects: 0, toolCalls: 0, builtinTools: {},
      firstActivity: null, lastActivity: null, activeDays: 0,
    },
    ...extra,
  };
}

export function codexSource(extra: Partial<CodexSource> = {}): CodexSource {
  return {
    model: null, reasoningEffort: null, mcpServers: [], skills: [], hooks: [], commands: [],
    instructions: { present: false, lines: 0, bytes: 0 }, rulesFiles: 0,
    usage: {
      sessions: 0, mcpCalls: 0, subagentActivities: 0, commandExecutions: 0,
      firstActivity: null, lastActivity: null, activeDays: 0,
    },
    ...extra,
  };
}

export function piSource(extra: Partial<PiSource> = {}): PiSource {
  return {
    model: null, mcpServers: [], skills: [], plugins: [], commands: [],
    instructions: { present: false, lines: 0, bytes: 0 },
    usage: {
      sessions: 0, toolCalls: 0, builtinTools: {}, mcpCalls: 0, subagentRuns: 0,
      firstActivity: null, lastActivity: null, activeDays: 0,
    },
    ...extra,
  };
}

export function profile(extra: Partial<HarnessProfile> = {}): HarnessProfile {
  return {
    schemaVersion: 1,
    generatedAt: '2026-11-09T14:21:47.950Z',
    collector: { name: 'harness-craft', version: '0.1.0' },
    claudeCode: null,
    codex: null,
    redactions: { paths: 0, emails: 0, secrets: 0, urls: 0 },
    warnings: [],
    ...extra,
  };
}

export function visibility(extra: Partial<Visibility> = {}): Visibility {
  return { ...DEFAULT_VISIBILITY, showDescriptions: true, ...extra };
}
