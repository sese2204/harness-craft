// Pi as a third source: three-way merge, stat inputs, experience, hero main tool, validation of an optional `pi`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { HarnessProfile } from '@harness-craft/schema';

import { buildHero, listEntries, parseProfile, toSheet } from '../src/index.js';
import { claudeSource, codexSource, hook, mcp, piSource, profile, skill, visibility } from './helpers.js';

const roundTrip = (v: unknown): unknown => JSON.parse(JSON.stringify(v)) as unknown;

const threeWay = (): HarnessProfile =>
  profile({
    claudeCode: claudeSource({ mcpServers: [mcp('github', 100, { package: '@x/github' })], skills: [skill('tdd', 3)] }),
    codex: codexSource({ mcpServers: [mcp('github', 10)], skills: [skill('tdd', 2)] }),
    pi: piSource({
      mcpServers: [mcp('github', 1), mcp('dev-radius', 40)],
      skills: [skill('tdd', 1), skill('pdf', 7, { source: 'plugin:@fixture/pi-tools' })],
    }),
  });

test('MCP and skills with the same name merge across all three tools, origins in claude·codex·pi order', () => {
  const sheet = toSheet(threeWay(), visibility());
  const github = sheet.equipment.find((s) => s.item?.name === 'github')?.item;
  assert.deepEqual([github?.calls, github?.origins, github?.desc], [111, ['claude', 'codex', 'pi'], '@x/github']);
  assert.deepEqual(sheet.equipment.find((s) => s.item?.name === 'dev-radius')?.item?.origins, ['pi']);
  const entries = listEntries(threeWay());
  assert.deepEqual(entries.skills.map((e) => [e.key, e.count, e.origins]), [
    ['pdf', 7, ['pi']],
    ['tdd', 6, ['claude', 'codex', 'pi']],
  ]);
  assert.equal(sheet.skills.shown.find((s) => s.name === 'pdf')?.acquired, '플러그인 @fixture/pi-tools');
  assert.deepEqual(sheet.sources, ['claude', 'codex', 'pi']);
});

test('Pi feeds execution (shell and file tools), tooling (MCP calls), command (subagent runs), guidance and exp', () => {
  const p = profile({
    claudeCode: claudeSource({ usage: { ...claudeSource().usage!, toolCalls: 70, builtinTools: { Bash: 10 } } }),
    pi: piSource({
      mcpServers: [mcp('dev-radius', 40)],
      instructions: { present: true, lines: 12, bytes: 1 },
      usage: {
        ...piSource().usage!,
        toolCalls: 30,
        mcpCalls: 40,
        subagentRuns: 4,
        activeDays: 9,
        // ls, codemode and tool_search are not shell or file work.
        builtinTools: { bash: 5, powershell: 1, read: 4, edit: 3, write: 2, grep: 1, find: 1, ls: 50, codemode: 60, tool_search: 7 },
      },
    }),
  });
  const raw = Object.fromEntries(toSheet(p, visibility()).stats.map((s) => [s.key, s.raw]));
  assert.equal(raw.execution, 10 + 17);
  assert.equal(raw.tooling, 40);
  assert.equal(raw.command, 4);
  assert.equal(raw.guidance, 12);
  // No `activity` (older file): the largest of the tools' active days.
  assert.equal(raw.consistency, 9);
  assert.equal(toSheet(p, visibility()).level.exp, 100);
});

type Use = { days: number; models?: Record<string, number> } | null;

function withDays(claude: Use, codex: Use, pi: Use): HarnessProfile {
  const usage = <U extends object>(base: U, u: NonNullable<Use>): U => ({ ...base, activeDays: u.days, ...(u.models ? { models: u.models } : {}) });
  return profile({
    claudeCode: claude ? claudeSource({ model: 'sonnet', usage: usage(claudeSource().usage!, claude) }) : null,
    codex: codex ? codexSource({ model: 'gpt-x', usage: usage(codexSource().usage!, codex) }) : null,
    ...(pi ? { pi: piSource({ model: 'claude-haiku-5-5', usage: usage(piSource().usage!, pi) }) } : {}),
  });
}

test('Pi with the most active days is the main tool; its top model picks the class', () => {
  const hero = buildHero(withDays({ days: 10, models: { 'claude-opus-5-5': 50 } }, { days: 3 }, { days: 30, models: { 'claude-sonnet-5-5': 20 } }), 12);
  assert.deepEqual([hero.source, hero.cls, hero.model, hero.secondary], ['pi', '궁수', 'claude-sonnet-5-5', '마법사']);
});

test('without usage models Pi falls back to its configured model; the strongest other tool is the secondary', () => {
  const hero = buildHero(withDays({ days: 2 }, { days: 9, models: { 'gpt-6.1-sol': 5 } }, { days: 20 }), 1);
  assert.deepEqual([hero.source, hero.cls, hero.secondary], ['pi', '도적', '마법사']);
});

test('ties prefer Claude Code, then Codex, then Pi', () => {
  assert.equal(buildHero(withDays({ days: 5 }, { days: 5 }, { days: 5 }), 1).source, 'claude');
  assert.equal(buildHero(withDays(null, { days: 5 }, { days: 5 }), 1).source, 'codex');
  assert.equal(buildHero(withDays(null, null, { days: 0 }), 1).source, 'pi');
});

test('parseProfile accepts profiles with and without pi, and checks Pi fields', () => {
  assert.equal(parseProfile(roundTrip(threeWay())).ok, true);
  assert.equal(parseProfile(roundTrip(profile({ pi: null }))).ok, true);
  assert.equal(parseProfile(roundTrip(profile({ pi: piSource({ usage: null }) }))).ok, true);
  const bad = parseProfile({
    ...profile(),
    pi: piSource({ skills: [{ ...skill('a', 1), uses: -1 }], usage: { ...piSource().usage!, toolCalls: -1, builtinTools: { read: 'x' as never } } }),
  });
  assert.deepEqual(bad.ok ? [] : bad.errors, [
    'pi.skills[0].uses 값이 올바르지 않습니다',
    'pi.usage.toolCalls 값이 올바르지 않습니다',
    'pi.usage.builtinTools.read 값이 올바르지 않습니다',
  ]);
  assert.equal(parseProfile({ ...profile(), pi: 'nope' }).ok, false);
});

test('hooks still come only from Claude Code and Codex', () => {
  const p = profile({ claudeCode: claudeSource({ hooks: [hook('Stop')] }), pi: piSource() });
  assert.deepEqual(listEntries(p).hooks.map((h) => h.origins), [['claude']]);
});
