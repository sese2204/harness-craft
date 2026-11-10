// Runs the built CLI (dist/cli.js) so the template is found next to it, as in the published package.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { SHARE_LAST_LINE } from '../src/shareCommand.js';
import { SHARE_DATA_ID, SHARE_PLACEHOLDER, type ShareData } from '../src/shareFormat.js';
import { LEAK_MARKERS, makeHome } from './helpers.js';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

function run(args: string[], cwd: string) {
  assert.ok(existsSync(CLI), `${CLI} 가 없습니다. pnpm build 를 먼저 실행하세요.`);
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

function shareData(html: string): ShareData {
  const open = `<script type="application/json" id="${SHARE_DATA_ID}">`;
  const start = html.indexOf(open) + open.length;
  return JSON.parse(html.slice(start, html.indexOf('</script>', start))) as ShareData;
}

test('share writes one HTML file with the handle and the data in place of the placeholder', async () => {
  const { home, cleanup } = await makeHome();
  try {
    const r = run(['share', '--home', home, '--handle', 'sese2204', '--hide', 'REMOTE', '--hide', 'beta'], home);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
    const out = join(home, 'harness-sheet.html');
    const html = await readFile(out, 'utf8');
    assert.equal(html.includes(SHARE_PLACEHOLDER), false);
    const data = shareData(html);
    assert.equal(data.handle, 'sese2204');
    assert.equal(data.profile.schemaVersion, 1);
    const names = data.profile.claudeCode?.mcpServers.map((s) => s.name);
    assert.deepEqual(names, ['leaky-stdio', 'npx-server', 'proj-server', 'sse-one']);
    assert.ok(data.profile.claudeCode?.skills.every((s) => s.description === ''));
    // cwd may come back through /private on macOS, so only the file name is compared.
    assert.match(r.stderr, /^저장: \S+\/harness-sheet\.html \(\d+\.\dKB\)$/m);
    assert.match(r.stderr, /숨긴 항목: 2개/);
    assert.equal(r.stderr.trimEnd().split('\n').at(-1), SHARE_LAST_LINE);
  } finally {
    await cleanup();
  }
});

test('share --out and the default handle; a bad handle exits 2 and writes nothing', async () => {
  const { home, cleanup } = await makeHome();
  try {
    const ok = run(['share', '--no-usage', '--home', home, '--out', 'card.html'], home);
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(shareData(await readFile(join(home, 'card.html'), 'utf8')).handle, 'player');
    for (const handle of ['bad handle', '', 'a'.repeat(40), '<script>']) {
      const bad = run(['share', '--home', home, '--handle', handle, '--out', 'bad.html'], home);
      assert.equal(bad.status, 2, handle);
    }
    assert.equal(existsSync(join(home, 'bad.html')), false);
    assert.equal(run(['scan', '--handle', 'x', '--home', home], home).status, 2, 'share-only option on scan');
    assert.equal(run(['share', '--json', '--home', home], home).status, 2, 'scan-only option on share');
  } finally {
    await cleanup();
  }
});

test('no planted marker reaches the shared HTML, even with descriptions', async () => {
  const { home, cleanup } = await makeHome();
  try {
    const r = run(['share', '--home', home, '--descriptions'], home);
    assert.equal(r.status, 0, r.stderr);
    const html = await readFile(join(home, 'harness-sheet.html'), 'utf8');
    for (const marker of [...LEAK_MARKERS, home]) assert.equal(html.includes(marker), false, `marker leaked: ${marker}`);
    // Not vacuous: descriptions made it in.
    assert.ok(shareData(html).profile.claudeCode?.skills.some((s) => s.description !== ''));
  } finally {
    await cleanup();
  }
});
