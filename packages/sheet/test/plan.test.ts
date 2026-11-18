import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MANA_HALF, buildMana, buildStage, parseProfile, toSheet } from '../src/index.js';
import { claudeSource, codexSource, profile, visibility } from './helpers.js';

test('stage: each plan maps to a stage, labels come from the enum', () => {
  const cases: Array<[string, string]> = [['free', 'field'], ['pro', 'gate'], ['max', 'throne'], ['team', 'guild'], ['enterprise', 'guild']];
  for (const [claude, kind] of cases) {
    const stage = buildStage(profile({ claudeCode: claudeSource({ plan: claude as 'pro' }), codex: null }));
    assert.equal(stage?.kind, kind, claude);
  }
  const codex = buildStage(profile({ claudeCode: null, codex: codexSource({ plan: 'plus' }) }));
  assert.deepEqual(codex, { kind: 'gate', plans: [{ tool: 'codex', label: 'ChatGPT Plus' }] });
});

test('stage: the higher of the two tools wins (field < gate < guild < throne), both labels are kept', () => {
  const stage = buildStage(profile({ claudeCode: claudeSource({ plan: 'team' }), codex: codexSource({ plan: 'pro' }) }));
  assert.deepEqual(stage, {
    kind: 'throne',
    plans: [{ tool: 'claude', label: 'Claude Team' }, { tool: 'codex', label: 'ChatGPT Pro' }],
  });
  assert.equal(buildStage(profile({ claudeCode: claudeSource({ plan: 'pro' }), codex: codexSource({ plan: 'business' }) }))?.kind, 'guild');
});

test('stage: no plan, null plan, or an unknown / prototype-key string → null', () => {
  assert.equal(buildStage(profile({ claudeCode: claudeSource(), codex: codexSource() })), null);
  assert.equal(buildStage(profile({ claudeCode: claudeSource({ plan: null }), codex: null })), null);
  for (const bad of ['ultra', '__proto__', 'constructor', 'toString', 'Max']) {
    const p = profile({ claudeCode: claudeSource({ plan: bad as 'max' }), codex: codexSource({ plan: bad as 'pro' }) });
    assert.equal(buildStage(p), null, bad);
  }
});

test('mana: sums output tokens across tools; fill is tokens/(tokens+MANA_HALF); null when no tool reports it', () => {
  const p = profile({
    claudeCode: claudeSource({ usage: { ...claudeSource().usage!, outputTokens: 3_000_000 } }),
    codex: codexSource({ usage: { ...codexSource().usage!, outputTokens: 2_000_000 } }),
  });
  const mana = buildMana(p);
  assert.equal(mana?.tokens, 5_000_000);
  assert.equal(mana?.fill, 5_000_000 / (5_000_000 + MANA_HALF));
  assert.equal(buildMana(profile({ claudeCode: claudeSource(), codex: codexSource() })), null);
  assert.equal(buildMana(profile({ claudeCode: claudeSource({ usage: null }), codex: null })), null);
});

test('toSheet carries stage and mana; the validator accepts plan/outputTokens and rejects bad types', () => {
  const p = profile({
    claudeCode: claudeSource({ plan: 'max', usage: { ...claudeSource().usage!, outputTokens: 10 } }),
    codex: null,
  });
  const sheet = toSheet(p, visibility());
  assert.equal(sheet.stage?.kind, 'throne');
  assert.equal(sheet.mana?.tokens, 10);
  assert.equal(parseProfile(JSON.parse(JSON.stringify(p))).ok, true);
  const bad = JSON.parse(JSON.stringify(p));
  bad.claudeCode.plan = 7;
  bad.claudeCode.usage.outputTokens = -1;
  const res = parseProfile(bad);
  assert.equal(res.ok, false);
  assert.equal(res.ok ? 0 : res.errors.length, 2);
});
