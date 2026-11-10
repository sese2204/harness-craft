import type { ClaudeCodeSource, CodexSource, HarnessProfile } from './types.js';

export const NO_UPLOAD_LINE = '아무것도 업로드하지 않았습니다.';
const MAX_WARNINGS_SHOWN = 10;

function range(first: string | null, last: string | null): string {
  return first && last ? ` (${first} ~ ${last})` : '';
}

function claudeLines(c: ClaudeCodeSource): string[] {
  const lines = [
    `Claude Code — 모델 ${c.model ?? '-'}`,
    `  MCP ${c.mcpServers.length} · 스킬 ${c.skills.length} · 에이전트 ${c.agents.length} · 훅 ${c.hooks.length} · 플러그인 ${c.plugins.length} · 명령 ${c.commands.length}`,
    `  CLAUDE.md ${c.instructions.present ? `${c.instructions.lines}줄` : '없음'}`,
  ];
  const u = c.usage;
  if (u) {
    lines.push(
      `  사용 기록: 세션 ${u.sessions} · 서브에이전트 실행 ${u.subagentRuns} · 도구 호출 ${u.toolCalls} · 활동일 ${u.activeDays}${range(u.firstActivity, u.lastActivity)}`,
    );
  }
  return lines;
}

function codexLines(c: CodexSource): string[] {
  const lines = [
    `Codex — 모델 ${c.model ?? '-'}${c.reasoningEffort ? ` (${c.reasoningEffort})` : ''}`,
    `  MCP ${c.mcpServers.length} · 스킬 ${c.skills.length} · 훅 ${c.hooks.length} · 프롬프트 ${c.commands.length} · 규칙 파일 ${c.rulesFiles}`,
    `  AGENTS.md ${c.instructions.present ? `${c.instructions.lines}줄` : '없음'}`,
  ];
  const u = c.usage;
  if (u) {
    lines.push(
      `  사용 기록: 세션 ${u.sessions} · MCP 호출 ${u.mcpCalls} · 서브에이전트 ${u.subagentActivities} · 명령 실행 ${u.commandExecutions} · 활동일 ${u.activeDays}${range(u.firstActivity, u.lastActivity)}`,
    );
  }
  return lines;
}

/** Human-readable summary for stderr. The last line always states that nothing was uploaded. */
export function formatSummary(profile: HarnessProfile, savedTo: string | null): string {
  const r = profile.redactions;
  const lines = [
    `harness-craft ${profile.collector.version} 스캔 결과`,
    ...(profile.claudeCode ? claudeLines(profile.claudeCode) : ['Claude Code — 찾지 못함']),
    ...(profile.codex ? codexLines(profile.codex) : ['Codex — 찾지 못함']),
    `가림 처리: 경로 ${r.paths} · 이메일 ${r.emails} · 비밀값 ${r.secrets} · URL ${r.urls}`,
  ];
  if (profile.warnings.length > 0) {
    lines.push(`경고 ${profile.warnings.length}건:`);
    lines.push(...profile.warnings.slice(0, MAX_WARNINGS_SHOWN).map((w) => `  - ${w}`));
    if (profile.warnings.length > MAX_WARNINGS_SHOWN) lines.push(`  … 외 ${profile.warnings.length - MAX_WARNINGS_SHOWN}건 (JSON warnings 참고)`);
  }
  lines.push(savedTo ? `저장: ${savedTo}` : '저장: 안 함 (--json, stdout 으로 출력)');
  lines.push(NO_UPLOAD_LINE);
  return lines.join('\n') + '\n';
}
