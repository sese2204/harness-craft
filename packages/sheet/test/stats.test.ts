import assert from 'node:assert/strict';
import { test } from 'node:test';

import { levelFor, score, toSheet } from '../src/index.js';
import { agent, claudeSource, codexSource, hook, mcp, profile, skill, visibility } from './helpers.js';

test('score() follows round(100 × min(1, log10(1+x)/log10(1+cap)))', () => {
  assert.equal(score(0, 2000), 0);
  assert.equal(score(9, 99), 50);
  assert.equal(score(2000, 2000), 100);
  assert.equal(score(999_999, 120), 100);
  assert.equal(score(100, 2000), Math.round((100 * Math.log10(101)) / Math.log10(2001)));
});

test('level = floor(sqrt(exp/25)) with EXP progress toward the next level', () => {
  assert.deepEqual(levelFor(0), { level: 0, exp: 0, current: 0, needed: 25, progress: 0 });
  assert.equal(levelFor(24).level, 0);
  assert.deepEqual(levelFor(25), { level: 1, exp: 25, current: 0, needed: 75, progress: 0 });
  assert.deepEqual(levelFor(100), { level: 2, exp: 100, current: 0, needed: 125, progress: 0 });
  const l = levelFor(58_348);
  assert.equal(l.level, 48);
  assert.equal(l.current, 58_348 - 25 * 48 ** 2);
  assert.equal(l.needed, 25 * (49 ** 2 - 48 ** 2));
});

test('exp = Claude toolCalls + Codex commandExecutions + Codex mcpCalls', () => {
  const p = profile({
    claudeCode: claudeSource({ usage: { ...claudeSource().usage!, toolCalls: 70 } }),
    codex: codexSource({ usage: { ...codexSource().usage!, commandExecutions: 20, mcpCalls: 10 } }),
  });
  assert.equal(toSheet(p, visibility()).level.exp, 100);
});

test('each axis uses its documented inputs', () => {
  const p = profile({
    claudeCode: claudeSource({
      hooks: [hook('Stop'), hook('PreToolUse', 'guard.sh')],
      skills: [skill('a', 30), skill('b', 10)],
      agents: [agent('opus-x', 7)],
      mcpServers: [mcp('github', 400)],
      instructions: { present: true, lines: 115, bytes: 1 },
      usage: {
        ...claudeSource().usage!,
        subagentRuns: 3,
        activeDays: 43,
        builtinTools: { Bash: 100, Read: 10, Edit: 5, Write: 4, Grep: 3, Glob: 2, WebFetch: 999 },
      },
    }),
    codex: codexSource({
      hooks: [hook('Stop', 'codex-hook-stop.js')],
      skills: [skill('c', 5)],
      mcpServers: [mcp('github', 100)],
      instructions: { present: true, lines: 20, bytes: 1 },
      usage: { ...codexSource().usage!, subagentActivities: 11, commandExecutions: 1000, activeDays: 47 },
    }),
  });
  const raw = Object.fromEntries(toSheet(p, visibility()).stats.map((s) => [s.key, s.raw]));
  assert.deepEqual(raw, {
    automation: 3 * 20 + 45,
    guidance: 115 + 20 + 3 * 10,
    command: 7 + 3 + 11,
    tooling: 500,
    execution: 124 + 1000,
    consistency: 47,
  });
  const sheet = toSheet(p, visibility());
  assert.deepEqual(sheet.stats.map((s) => s.name), ['자동화', '지침력', '에이전트 지휘', '도구 활용', '실행력', '꾸준함']);
  assert.equal(sheet.statTotal, sheet.stats.reduce((a, s) => a + s.value, 0));
});

test('title follows the highest stat; ties go to the earlier axis', () => {
  const p = profile({ claudeCode: claudeSource({ usage: { ...claudeSource().usage!, activeDays: 120 } }) });
  assert.equal(toSheet(p, visibility()).title, '성실한 모험가');
  // automation x = 2000 (100 hooks) and consistency 120 → both 100, automation wins.
  const tie = profile({
    claudeCode: claudeSource({
      hooks: Array.from({ length: 100 }, () => hook('Stop')),
      usage: { ...claudeSource().usage!, activeDays: 120 },
    }),
  });
  assert.equal(toSheet(tie, visibility()).title, '자동화 장인');
});

test('usage null → usage-based axes and level are 0', () => {
  const p = profile({
    claudeCode: claudeSource({ usage: null, hooks: [hook('Stop')], instructions: { present: true, lines: 10, bytes: 1 } }),
    codex: codexSource({ usage: null }),
  });
  const sheet = toSheet(p, visibility());
  const byKey = Object.fromEntries(sheet.stats.map((s) => [s.key, s.raw]));
  assert.equal(byKey.command, 0);
  assert.equal(byKey.tooling, 0);
  assert.equal(byKey.execution, 0);
  assert.equal(byKey.consistency, 0);
  assert.equal(byKey.automation, 20);
  assert.equal(byKey.guidance, 10);
  assert.equal(sheet.level.level, 0);
  assert.equal(sheet.level.exp, 0);
});

test('consistency uses the cross-tool union (activity) when present, else the larger activeDays', () => {
  const claudeCode = claudeSource({ usage: { ...claudeSource().usage!, activeDays: 50 } });
  const codex = codexSource({ usage: { ...codexSource().usage!, activeDays: 50 } });
  const raw = (p: ReturnType<typeof profile>) => toSheet(p, visibility()).stats.find((s) => s.key === 'consistency')?.raw;
  const union = { activeDays: 100, firstActivity: '2026-01-01', lastActivity: '2026-11-01' };
  assert.equal(raw(profile({ claudeCode, codex, activity: union })), 100);
  // Older file without `activity`, and a profile scanned with --no-usage (activity null): fall back to max.
  assert.equal(raw(profile({ claudeCode, codex })), 50);
  assert.equal(raw(profile({ claudeCode, codex, activity: null })), 50);
});
