import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseProfile } from '../src/index.js';
import { claudeSource, codexSource, profile, skill } from './helpers.js';

test('accepts a valid profile', () => {
  const result = parseProfile(JSON.parse(JSON.stringify(profile({ claudeCode: claudeSource(), codex: codexSource() }))));
  assert.equal(result.ok, true);
});

test('rejects non-objects and other schema versions', () => {
  assert.deepEqual(parseProfile([]), { ok: false, errors: ['JSON 최상위가 객체가 아닙니다'] });
  const v2 = parseProfile({ ...profile(), schemaVersion: 2 });
  assert.equal(v2.ok, false);
  assert.match(v2.ok ? '' : v2.errors[0] ?? '', /schemaVersion/);
});

test('reports missing required keys and bad fields with paths', () => {
  const { claudeCode: _drop, ...rest } = profile();
  const missing = parseProfile(rest);
  assert.deepEqual(missing.ok ? [] : missing.errors, ['claudeCode 키가 없습니다']);
  const bad = parseProfile({
    ...profile(),
    claudeCode: { ...claudeSource(), skills: [{ ...skill('a', 1), uses: -1 }] },
  });
  assert.deepEqual(bad.ok ? [] : bad.errors, ['claudeCode.skills[0].uses 값이 올바르지 않습니다']);
});

test('accepts usage null and caps the error list', () => {
  assert.equal(parseProfile(profile({ codex: codexSource({ usage: null }) })).ok, true);
  const many = parseProfile({ ...profile(), claudeCode: { ...claudeSource(), mcpServers: Array.from({ length: 20 }, () => ({})) } });
  assert.equal(many.ok, false);
  assert.equal(many.ok ? 0 : many.errors.length, 9);
});
