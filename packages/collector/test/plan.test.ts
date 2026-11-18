// Subscription plans: Claude from ~/.claude.json oauthAccount, Codex from token_count rate_limits in the session logs.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import { collectProfile } from '../src/collect.js';
import { claudePlanOf, codexPlanOf } from '../src/plan.js';
import { FIXED_NOW, makeHome, scanFixture } from './helpers.js';

test('claudePlanOf: organizationType first (claude_ dropped, any case), then an exact planDisplayName', () => {
  const cases: Array<[unknown, string | null]> = [
    [{ organizationType: 'claude_max', planDisplayName: 'Ultra' }, 'max'],
    [{ organizationType: 'claude_free' }, 'free'],
    [{ organizationType: 'CLAUDE_PRO' }, 'pro'],
    [{ organizationType: 'claude_team' }, 'team'],
    [{ organizationType: ' claude_enterprise ' }, 'enterprise'],
    [{ organizationType: 'max' }, 'max'],
    [{ organizationType: 'claude_ultra', planDisplayName: ' Pro ' }, 'pro'],
    [{ planDisplayName: 'Team' }, 'team'],
    [{ organizationType: 'claude_ultra', planDisplayName: 'Ultra' }, null],
    [{ planDisplayName: 'Max 20x' }, null],
    [{ organizationType: 'claude_claude_max' }, null],
    [{ organizationType: 5, planDisplayName: null }, null],
    [{}, null],
    [null, null],
    ['claude_max', null],
  ];
  for (const [account, expected] of cases) assert.equal(claudePlanOf(account), expected, JSON.stringify(account));
});

test('claudePlanOf reads no oauthAccount field but organizationType and planDisplayName', () => {
  const read: string[] = [];
  const account = new Proxy({ organizationType: 'claude_ultra', planDisplayName: 'Ultra', emailAddress: 'x', fullName: 'y' }, {
    get(target, key, receiver) {
      read.push(String(key));
      return Reflect.get(target, key, receiver);
    },
  });
  assert.equal(claudePlanOf(account), null);
  assert.deepEqual([...new Set(read)].sort(), ['organizationType', 'planDisplayName']);
});

test('codexPlanOf: listed plans in any case, prolite folded into pro, anything else null', () => {
  for (const plan of ['free', 'go', 'plus', 'pro', 'team', 'business', 'enterprise', 'edu']) assert.equal(codexPlanOf(plan), plan);
  assert.equal(codexPlanOf('prolite'), 'pro');
  assert.equal(codexPlanOf(' PLUS '), 'plus');
  for (const raw of ['galaxy', 'pro_plus', '', null]) assert.equal(codexPlanOf(raw), null, String(raw));
});

test('fixture: Claude plan from organizationType (display name Ultra), Codex plan from the session log', async () => {
  const { profile } = await scanFixture();
  assert.equal(profile.claudeCode?.plan, 'max');
  assert.equal(profile.codex?.plan, 'plus');
});

test('plan: false leaves both plans null; without usage the Codex plan is null and Claude still has one', async () => {
  const { home, cleanup } = await makeHome();
  try {
    const off = await collectProfile({ home, usage: true, plan: false, now: FIXED_NOW });
    assert.equal(off.claudeCode?.plan, null);
    assert.equal(off.codex?.plan, null);
    const noUsage = await collectProfile({ home, usage: false, now: FIXED_NOW });
    assert.equal(noUsage.claudeCode?.plan, 'max');
    assert.equal(noUsage.codex?.plan, null);
  } finally {
    await cleanup();
  }
});

test('no oauthAccount gives a null Claude plan', async () => {
  const { home, cleanup } = await makeHome();
  try {
    const path = join(home, '.claude.json');
    const { oauthAccount: _drop, ...rest } = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    await writeFile(path, JSON.stringify(rest));
    assert.equal((await collectProfile({ home, usage: false, now: FIXED_NOW })).claudeCode?.plan, null);
  } finally {
    await cleanup();
  }
});

const tokenCount = (timestamp: string, planType: string | null, output: number | null) =>
  JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: output === null ? null : { total_token_usage: { input_tokens: 1, output_tokens: output, total_tokens: output + 1 } },
      rate_limits: { plan_type: planType },
    },
  });

async function codexHomeWith(files: Record<string, string[]>): Promise<{ home: string; cleanup: () => Promise<void> }> {
  const made = await makeHome();
  const day = join(made.home, '.codex', 'sessions', '2026', '11', '01');
  await mkdir(day, { recursive: true });
  for (const [name, lines] of Object.entries(files)) await writeFile(join(day, name), `${lines.join('\n')}\n`);
  return made;
}

test('Codex plan: the latest non-null plan_type across files wins, whatever the session kind', async () => {
  const { home, cleanup } = await codexHomeWith({
    'rollout-x.jsonl': [tokenCount('2026-11-01T05:00:00.000Z', 'team', 10), tokenCount('2026-11-01T09:00:00.000Z', null, 20)],
    'rollout-y.jsonl': [
      JSON.stringify({ type: 'session_meta', payload: { source: 'exec' } }),
      tokenCount('2026-11-01T06:00:00.000Z', 'prolite', null),
    ],
  });
  try {
    // rollout-y's prolite (06:00) beats the fixture's plus (10-08) and x's team (05:00); x's 09:00 line has no plan.
    assert.equal((await collectProfile({ home, usage: true, now: FIXED_NOW })).codex?.plan, 'pro');
    await writeFile(join(home, '.codex', 'sessions', '2026', '11', '01', 'rollout-z.jsonl'), `${tokenCount('2026-11-01T07:00:00.000Z', 'galaxy', 1)}\n`);
    // The latest value is unrecognized: null, not an older recognized one and never the raw string.
    const later = await collectProfile({ home, usage: true, now: FIXED_NOW });
    assert.equal(later.codex?.plan, null);
    assert.equal(JSON.stringify(later).includes('galaxy'), false);
  } finally {
    await cleanup();
  }
});
