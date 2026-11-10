// `harness-craft share`: scan → prepareShareProfile → fill the template → write one HTML file (docs/share-spec.md).
import { writeFile } from 'node:fs/promises';

import { NO_UPLOAD_LINE } from './summary.js';
import type { ShareData } from './shareFormat.js';
import { fillShareTemplate, loadShareTemplate } from './shareHtml.js';
import { prepareShareProfile, type ShareOptions } from './shareProfile.js';
import type { HarnessProfile } from './types.js';

export const SHARE_LAST_LINE = `이 파일 하나만 보내면 됩니다. ${NO_UPLOAD_LINE}`;

export interface ShareRequest extends ShareOptions {
  handle: string;
  out: string;
}

export interface ShareResult {
  out: string;
  bytes: number;
  hidden: number;
  profile: HarnessProfile;
}

export async function writeShareSheet(profile: HarnessProfile, request: ShareRequest): Promise<ShareResult> {
  const prepared = prepareShareProfile(profile, { hide: request.hide, descriptions: request.descriptions });
  const data: ShareData = { handle: request.handle, profile: prepared.profile };
  const html = fillShareTemplate(await loadShareTemplate(), data);
  await writeFile(request.out, html, 'utf8');
  return { out: request.out, bytes: Buffer.byteLength(html), hidden: prepared.hidden, profile: prepared.profile };
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes}B` : `${(bytes / 1024).toFixed(1)}KB`;
}

/** Human-readable summary for stderr. Counts add up both sources, as in the file. */
export function formatShareSummary(result: ShareResult, descriptions: boolean): string {
  const c = result.profile.claudeCode;
  const x = result.profile.codex;
  const mcp = (c?.mcpServers.length ?? 0) + (x?.mcpServers.length ?? 0);
  const skills = (c?.skills.length ?? 0) + (x?.skills.length ?? 0);
  const agents = c?.agents.length ?? 0;
  const hooks = (c?.hooks.length ?? 0) + (x?.hooks.length ?? 0);
  const lines = [
    `저장: ${result.out} (${formatSize(result.bytes)})`,
    `담긴 항목: MCP ${mcp} · 스킬 ${skills} · 에이전트 ${agents} · 훅 ${hooks}`,
    `숨긴 항목: ${result.hidden}개`,
    `설명: ${descriptions ? '포함' : '뺌 (--descriptions 로 포함)'}`,
    SHARE_LAST_LINE,
  ];
  return lines.join('\n') + '\n';
}
