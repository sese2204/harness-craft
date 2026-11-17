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
  /** Assistant API messages per model id (unique message.id). Ids that are not plain model names are under 'other'. Optional for older files. */
  models?: Record<string, number>;
  firstActivity: string | null;
  lastActivity: string | null;
  activeDays: number;
};

export type CodexUsage = {
  /** Interactive sessions: not subagent rollouts, not `codex exec`. */
  sessions: number;
  /** Non-interactive `codex exec` runs. Optional for older files. */
  execSessions?: number;
  /** Days with at least one interactive session (not exec, not subagent). */
  interactiveDays?: number;
  mcpCalls: number;
  subagentActivities: number;
  commandExecutions: number;
  /** Turns per model id from interactive sessions; all turns only when there are no interactive ones. Optional for older files. */
  models?: Record<string, number>;
  firstActivity: string | null;
  lastActivity: string | null;
  activeDays: number;
};

export type PiUsage = {
  /** Session files (`/fork` and `/clone` make new files, so each counts). */
  sessions: number;
  /** Tool calls the model made, plus calls made from inside a tool (codemode nestedCalls). Deduped across forked files. */
  toolCalls: number;
  /** Calls per Pi built-in tool (read, bash, edit, write, grep, find, ls, powershell, codemode, tool_search). */
  builtinTools: Record<string, number>;
  /** `mcp__<server>__<tool>` calls, direct or from codemode scripts. */
  mcpCalls: number;
  /** Agents started by a `subagent` tool call (an extension tool; Pi has no built-in subagents). */
  subagentRuns: number;
  /** Assistant messages per model id. Ids that are not plain model names are under 'other'. */
  models?: Record<string, number>;
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

/** Pi (pi.dev coding agent). Pi has no hooks on disk and no built-in subagents, so neither is listed. */
export type PiSource = {
  model: string | null;
  mcpServers: McpServer[];
  skills: Skill[];
  /** Pi packages (npm, git, local) and user extensions. Built-in extensions (`builtin:*`) are not listed. */
  plugins: Plugin[];
  /** Prompt templates (`<agent-dir>/prompts/*.md`). */
  commands: Command[];
  instructions: Instructions;
  usage: PiUsage | null;
};

/** Active days across all tools (union of dates, not the larger of the two). Counts only; the day list is not kept. */
export type Activity = { activeDays: number; firstActivity: string | null; lastActivity: string | null };

export type Redactions = { paths: number; emails: number; secrets: number; urls: number };

export type HarnessProfile = {
  schemaVersion: 1;
  generatedAt: string;
  collector: { name: 'harness-craft'; version: string };
  claudeCode: ClaudeCodeSource | null;
  codex: CodexSource | null;
  /** Optional for older files. null when the Pi agent directory does not exist. */
  pi?: PiSource | null;
  /** Optional for older files. null when no usage scan ran (`--no-usage`, or no tool found). */
  activity?: Activity | null;
  redactions: Redactions;
  warnings: string[];
};
