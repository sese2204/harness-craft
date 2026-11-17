import { join } from 'node:path';

import type { ScanContext } from '../context.js';
import { describeError } from '../diagnostics.js';
import { parseHooks } from '../hooks.js';
import { pathExists, sortByName } from '../fsutil.js';
import { readInstructions, readNestedDefinitions } from '../items.js';
import { toCommand } from '../definitions.js';
import type { ClaudeCodeSource } from '../types.js';
import { scanClaudeTranscripts, type ClaudeTranscriptScan } from '../usage/claude.js';
import { numberField, readClaudeConfig, stringValue } from './config.js';
import { collectClaudeAgents, collectClaudeSkills } from './definitions.js';
import { collectClaudeMcp } from './mcp.js';
import { readInstalledPlugins, toPlugins } from './plugins.js';

const MAX_SHORT_FIELD_LENGTH = 64;

async function scanUsage(claudeDir: string, ctx: ScanContext): Promise<ClaudeTranscriptScan | null> {
  try {
    return await scanClaudeTranscripts(claudeDir, ctx.diag, ctx.onProgress?.('대화 기록 읽는 중'));
  } catch (err) {
    ctx.diag.warn(join(claudeDir, 'projects'), `대화 기록 집계 실패 (${describeError(err)})`);
    return null;
  }
}

export type ClaudeCodeResult = {
  source: ClaudeCodeSource | null;
  /** Transcript dates for the cross-tool activity union. null when no transcript scan ran. */
  days: ReadonlySet<string> | null;
};

/** source is null when neither ~/.claude nor ~/.claude.json exists. */
export async function collectClaudeCode(ctx: ScanContext, options: { usage: boolean }): Promise<ClaudeCodeResult> {
  const claudeDir = join(ctx.home, '.claude');
  const [hasDir, hasJson] = await Promise.all([pathExists(claudeDir), pathExists(join(ctx.home, '.claude.json'))]);
  if (!hasDir && !hasJson) return { source: null, days: null };

  const config = await readClaudeConfig(ctx.home, ctx.diag);
  const scan = options.usage ? await scanUsage(claudeDir, ctx) : null;
  const installed = await readInstalledPlugins(claudeDir, ctx);
  const { settings, claudeJson } = config;

  const source: ClaudeCodeSource = {
    model: ctx.redactor.optional(stringValue(settings, 'model'), MAX_SHORT_FIELD_LENGTH),
    since: ctx.redactor.optional(stringValue(claudeJson, 'claudeCodeFirstTokenDate') ?? stringValue(claudeJson, 'firstStartTime'), MAX_SHORT_FIELD_LENGTH),
    startups: numberField(claudeJson, 'numStartups'),
    mcpServers: collectClaudeMcp(claudeJson, scan?.mcpCalls ?? new Map(), ctx),
    skills: await collectClaudeSkills(claudeDir, installed, claudeJson, scan, ctx),
    agents: await collectClaudeAgents(claudeDir, installed, scan, ctx),
    hooks: parseHooks(settings.hooks, config.settingsPath, ctx.redactor, ctx.diag),
    plugins: toPlugins(installed, settings, claudeJson, ctx),
    commands: sortByName((await readNestedDefinitions(join(claudeDir, 'commands'), ctx.diag)).map((d) => toCommand(d, ctx))),
    instructions: await readInstructions(join(claudeDir, 'CLAUDE.md'), ctx.diag),
    usage: scan?.usage ?? null,
  };
  return { source, days: scan?.days ?? null };
}
