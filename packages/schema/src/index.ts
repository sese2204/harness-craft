// Output schema for harness-profile.json (docs/collector-spec.md, schemaVersion 1). Shared by the collector and the sheet.

/** `builtin` = an agent that ships with the tool (Claude Code `Explore`, Codex `worker`), listed only when used. */
export type Source = 'user' | 'builtin' | `plugin:${string}`;

export type McpServer = {
  name: string;
  transport: 'stdio' | 'http' | 'sse' | 'unknown';
  scope: 'user' | 'project';
  host?: string;
  command?: string;
  package?: string;
  calls: number;
};

export type Skill = {
  name: string;
  description: string;
  source: Source;
  uses: number;
  lastUsedAt: string | null;
};

export type Agent = {
  name: string;
  description: string;
  model: string | null;
  effort: string | null;
  toolCount: number | null;
  mcpServers: string[];
  source: Source;
  uses: number;
};

export type Hook = {
  event: string;
  matcher: string | null;
  type: string;
  label: string;
};

export type Plugin = {
  name: string;
  marketplace: string;
  version: string | null;
  enabled: boolean;
  uses: number;
};

export type Command = { name: string; description: string };

export type Instructions = { present: boolean; lines: number; bytes: number };

export type ClaudeUsage = {
  sessions: number;
  subagentRuns: number;
  projects: number;
  toolCalls: number;
  builtinTools: Record<string, number>;
  firstActivity: string | null;
  lastActivity: string | null;
  activeDays: number;
};

export type CodexUsage = {
  /** Interactive sessions: not subagent rollouts, not `codex exec`. */
  sessions: number;
  /** Non-interactive `codex exec` runs. Optional for older files. */
  execSessions?: number;
  mcpCalls: number;
  subagentActivities: number;
  commandExecutions: number;
  firstActivity: string | null;
  lastActivity: string | null;
  activeDays: number;
};

export type ClaudeCodeSource = {
  model: string | null;
  since: string | null;
  startups: number | null;
  mcpServers: McpServer[];
  skills: Skill[];
  agents: Agent[];
  hooks: Hook[];
  plugins: Plugin[];
  commands: Command[];
  instructions: Instructions;
  usage: ClaudeUsage | null;
};

export type CodexSource = {
  model: string | null;
  reasoningEffort: string | null;
  mcpServers: McpServer[];
  skills: Skill[];
  hooks: Hook[];
  commands: Command[];
  instructions: Instructions;
  rulesFiles: number;
  /** Optional so profiles written before Codex agents were collected still parse. The collector always emits it. */
  agents?: Agent[];
  /** Optional so older profiles still parse. The collector always emits it. */
  plugins?: Plugin[];
  usage: CodexUsage | null;
};

/** Active days across both tools (union of dates, not the larger of the two). Counts only; the day list is not kept. */
export type Activity = { activeDays: number; firstActivity: string | null; lastActivity: string | null };

export type Redactions = { paths: number; emails: number; secrets: number; urls: number };

export type HarnessProfile = {
  schemaVersion: 1;
  generatedAt: string;
  collector: { name: 'harness-craft'; version: string };
  claudeCode: ClaudeCodeSource | null;
  codex: CodexSource | null;
  /** Optional for older files. null when no usage scan ran (`--no-usage`, or neither tool found). */
  activity?: Activity | null;
  redactions: Redactions;
  warnings: string[];
};
