import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { NO_UPLOAD_LINE } from '../src/summary.js';
import { makeHome } from './helpers.js';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
// Resolved here because the child runs with cwd = temp home, where `tsx` is not resolvable.
const TSX = import.meta.resolve('tsx');

function run(args: string[], cwd: string) {
  return spawnSync(process.execPath, ['--import', TSX, CLI, ...args], { cwd, encoding: 'utf8' });
}

test('--json prints the profile to stdout, summary to stderr, writes no file', async () => {
  const { home, cleanup } = await makeHome();
  try {
    const r = run(['scan', '--json', '--home', home], home);
    assert.equal(r.status, 0, r.stderr);
    const profile = JSON.parse(r.stdout) as { schemaVersion: number };
    assert.equal(profile.schemaVersion, 1);
    assert.equal(r.stderr.trimEnd().split('\n').at(-1), NO_UPLOAD_LINE);
    assert.match(r.stderr, /대화 기록 읽는 중 3\/3/);
    assert.equal(existsSync(join(home, 'harness-profile.json')), false);
  } finally {
    await cleanup();
  }
});

test('--no-plan leaves both plans out and says so; without it the summary names them', async () => {
  const { home, cleanup } = await makeHome();
  try {
    const on = run(['scan', '--json', '--home', home], home);
    assert.equal(on.status, 0, on.stderr);
    const withPlan = JSON.parse(on.stdout) as { claudeCode: { plan: string | null }; codex: { plan: string | null } };
    assert.deepEqual([withPlan.claudeCode.plan, withPlan.codex.plan], ['max', 'plus']);
    assert.match(on.stderr, /^구독: Claude Max · ChatGPT Plus \(--no-plan 으로 뺌\)$/m);
    const off = run(['--json', '--no-plan', '--home', home], home);
    assert.equal(off.status, 0, off.stderr);
    const noPlan = JSON.parse(off.stdout) as { claudeCode: { plan: string | null }; codex: { plan: string | null } };
    assert.deepEqual([noPlan.claudeCode.plan, noPlan.codex.plan], [null, null]);
    assert.match(off.stderr, /^구독: 뺌 \(--no-plan\)$/m);
    assert.match(run(['--help'], home).stdout, /--no-plan +구독 등급\(Claude·ChatGPT\)을 담지 않음/);
  } finally {
    await cleanup();
  }
});

test('--out writes the file; unknown command exits 2', async () => {
  const { home, cleanup } = await makeHome();
  try {
    const r = run(['--no-usage', '--home', home, '--out', 'p.json'], home);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.ok(existsSync(join(home, 'p.json')));
    assert.equal(run(['upload'], home).status, 2);
  } finally {
    await cleanup();
  }
});
