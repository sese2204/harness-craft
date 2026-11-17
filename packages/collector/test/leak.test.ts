import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import { FAKE_GHP, FAKE_SK } from './fakeTokens.js';
import { LEAK_MARKERS as MARKERS, makeHome, scanFixture } from './helpers.js';

test('no planted marker survives in the profile JSON', async () => {
  // With ~/.pi too: auth.json, models.json, mcp.json env/headers and session text all carry LEAK- markers.
  const { profile, home } = await scanFixture({ pi: true });
  const json = JSON.stringify(profile);
  for (const marker of [...MARKERS, home]) {
    assert.equal(json.includes(marker), false, `marker leaked: ${marker}`);
  }
  assert.ok(profile.pi?.usage, 'Pi was scanned');
  // Something was actually redacted, so the test is not passing vacuously.
  assert.ok(profile.redactions.secrets > 0 && profile.redactions.urls > 0);
  assert.ok(profile.redactions.emails > 0 && profile.redactions.paths > 0);
});

test('no marker leaks without usage either', async () => {
  const { profile, home } = await scanFixture({ pi: true, usage: false });
  const json = JSON.stringify(profile);
  for (const marker of [...MARKERS, home]) assert.equal(json.includes(marker), false, marker);
  assert.equal(profile.claudeCode?.usage, null);
  assert.equal(profile.codex?.usage, null);
  assert.equal(profile.pi?.usage, null);
});

test('fixture placeholders are filled with real token shapes before scanning', async () => {
  const { home, cleanup } = await makeHome();
  try {
    const claudeJson = await readFile(join(home, '.claude.json'), 'utf8');
    const reviewer = await readFile(join(home, '.claude', 'agents', 'reviewer.md'), 'utf8');
    const alpha = await readFile(join(home, 'harness', 'skills', 'alpha', 'SKILL.md'), 'utf8');
    assert.ok(claudeJson.includes(FAKE_GHP) && claudeJson.includes(FAKE_SK));
    assert.ok(reviewer.includes(FAKE_GHP) && alpha.includes(FAKE_SK));
    assert.equal(`${claudeJson}${reviewer}${alpha}`.includes('__FAKE_'), false);
  } finally {
    await cleanup();
  }
});
