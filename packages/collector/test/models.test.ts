// Per-model usage counts: Claude assistant messages (unique message.id) and Codex interactive turns.
import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { collectProfile } from '../src/collect.js';
import { modelKey, OTHER_MODEL } from '../src/usage/lines.js';
import { FIXED_NOW, makeHome, scanFixture } from './helpers.js';

const assistant = (id: string, model: string, text = 'x') =>
  JSON.stringify({ type: 'assistant', timestamp: '2026-10-01T00:00:00.000Z', message: { model, id, role: 'assistant', content: [{ type: 'text', text }] } });

test('Claude models: unique message ids per model, synthetic skipped, odd ids under other, subagent transcripts counted', async () => {
  const home = await mkdtemp(join(tmpdir(), 'harness-craft-models-'));
  try {
    const project = join(home, '.claude', 'projects', 'p');
    await mkdir(join(project, 's1', 'subagents'), { recursive: true });
    // Key order the fast path cannot trust: content first, with a "model" key inside tool input.
    const contentFirst = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'tu1', name: 'Agent', input: { model: 'haiku' } }], model: 'claude-sonnet-5-5', id: 'msg_C' },
    });
    await writeFile(join(project, 's1.jsonl'), [
      assistant('msg_A', 'claude-opus-5-5', 'block 1'),
      assistant('msg_A', 'claude-opus-5-5', 'block 2'),
      assistant('msg_B', 'claude-opus-5-5'),
      assistant('msg_S', '<synthetic>'),
      assistant('msg_X', 'corp/LEAK-deployment name'),
      contentFirst,
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'say "type":"assistant"' } }),
    ].join('\n'));
    await writeFile(join(project, 's1', 'subagents', 'agent-a.jsonl'), [assistant('msg_D', 'claude-haiku-5-5'), assistant('msg_A', 'claude-opus-5-5')].join('\n'));
    const usage = (await collectProfile({ home, usage: true, now: FIXED_NOW })).claudeCode?.usage;
    assert.deepEqual(usage?.models, { 'claude-haiku-5-5': 1, 'claude-opus-5-5': 2, 'claude-sonnet-5-5': 1, other: 1 });
    assert.equal(usage?.toolCalls, 1);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('modelKey keeps plain model ids and folds everything else into other', () => {
  for (const id of ['claude-opus-5-5', 'gpt-5.5-sol', 'o4-mini', 'a_b.c']) assert.equal(modelKey(id), id);
  for (const id of ['', '-x', 'a b', 'corp/x', 'a'.repeat(65), 'モデル']) assert.equal(modelKey(id), OTHER_MODEL, id);
});

test('Claude fixture without model fields gives an empty models record', async () => {
  assert.deepEqual((await scanFixture()).profile.claudeCode?.usage?.models, {});
});

test('Codex models: interactive turns only (T4 duplicate counted once); all turns only without interactive ones', async () => {
  assert.deepEqual((await scanFixture()).profile.codex?.usage?.models, { 'gpt-5.5-luna': 1, 'gpt-5.5-sol': 3 });
  const { home, cleanup } = await makeHome();
  try {
    const sessions = join(home, '.codex', 'sessions', '2026', '10', '09');
    await appendFile(
      join(sessions, 'rollout-skills.jsonl'),
      `${JSON.stringify({ type: 'turn_context', payload: { turn_id: 'T9', model: 'corp/LEAK-model', effort: 'high' } })}\n`,
    );
    const odd = await collectProfile({ home, usage: true, now: FIXED_NOW });
    assert.deepEqual(odd.codex?.usage?.models, { 'gpt-5.5-luna': 1, 'gpt-5.5-sol': 3, other: 1 });
    await rm(join(sessions, 'rollout-skills.jsonl'));
    const fallback = await collectProfile({ home, usage: true, now: FIXED_NOW });
    // Exec ×5, subagent ×4, and the parent's T1 copied into the forked subagent rollout.
    assert.deepEqual(fallback.codex?.usage?.models, { 'gpt-5.5-sol': 1, 'gpt-exec-model': 5, 'gpt-sub-model': 4 });
  } finally {
    await cleanup();
  }
});
