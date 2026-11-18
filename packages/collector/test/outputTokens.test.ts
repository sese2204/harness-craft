// Output tokens ("mana") for Claude Code, Codex and Pi.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { collectProfile } from '../src/collect.js';
import { FIXED_NOW, scanFixture } from './helpers.js';

const AT = '2026-10-01T00:00:00.000Z';

/** Key order as Claude Code writes it: model and id first, usage after content. */
const claudeLine = (id: string, model: string, content: unknown[], output: number | null) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: AT,
    message: {
      model, id, type: 'message', role: 'assistant', content, stop_reason: null,
      ...(output === null ? {} : { usage: { input_tokens: 3, output_tokens: output, output_tokens_details: { output_tokens: 1 } } }),
    },
    uuid: `u-${id}`,
  });

const text = (t: string) => [{ type: 'text', text: t }];

async function withHome(run: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), 'harness-craft-output-'));
  try {
    await run(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

test('Claude output tokens: max per message.id, synthetic skipped, decoys in content ignored', async () => {
  await withHome(async (home) => {
    const project = join(home, '.claude', 'projects', 'p');
    await mkdir(join(project, 's1', 'subagents'), { recursive: true });
    const decoy = { usage: { output_tokens: 99999 } };
    await writeFile(join(project, 's1.jsonl'), [
      // Split over two lines, usage repeated with a growing value: 12.
      claudeLine('msg_A', 'claude-opus-5-5', [{ type: 'thinking', thinking: 'hmm' }], 5),
      claudeLine('msg_A', 'claude-opus-5-5', text('block 2'), 12),
      // A real usage object inside tool input (parsed path): only message.usage counts, 7.
      claudeLine('msg_B', 'claude-opus-5-5', [{ type: 'tool_use', id: 'tu1', name: 'Write', input: decoy }], 7),
      // The same text escaped inside a string (fast path): 3.
      claudeLine('msg_C', 'claude-opus-5-5', text(`"usage":{"output_tokens":5000} ${JSON.stringify(decoy)}`), 3),
      // No usage at all, a decoy in text: nothing.
      claudeLine('msg_D', 'claude-opus-5-5', text(`"usage":{"output_tokens":4000}`), null),
      claudeLine('msg_S', '<synthetic>', text('error'), 1000),
    ].join('\n'));
    await writeFile(join(project, 's1', 'subagents', 'agent-a.jsonl'), [
      claudeLine('msg_A', 'claude-opus-5-5', text('copy'), 12),
      claudeLine('msg_E', 'claude-haiku-5-5', text('sub'), 30),
    ].join('\n'));
    const usage = (await collectProfile({ home, usage: true, now: FIXED_NOW })).claudeCode?.usage;
    assert.equal(usage?.outputTokens, 12 + 7 + 3 + 30);
    assert.equal(usage?.toolCalls, 1);
  });
});

const tokenCount = (output: number | null, at = AT) =>
  JSON.stringify({
    timestamp: at,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: output === null ? null : { total_token_usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: output, reasoning_output_tokens: 2, total_tokens: output + 1 } },
      rate_limits: { plan_type: null },
    },
  });

test('Codex output tokens: largest running total per rollout, summed over interactive, exec and subagent files', async () => {
  await withHome(async (home) => {
    const day = join(home, '.codex', 'sessions', '2026', '10', '01');
    await mkdir(day, { recursive: true });
    await writeFile(join(day, 'rollout-a.jsonl'), [tokenCount(100), tokenCount(null), tokenCount(250), tokenCount(240)].join('\n'));
    await writeFile(join(day, 'rollout-exec.jsonl'), [JSON.stringify({ type: 'session_meta', payload: { source: 'exec' } }), tokenCount(40)].join('\n'));
    await writeFile(join(day, 'rollout-sub.jsonl'), [
      JSON.stringify({ type: 'session_meta', payload: { source: { subagent: { thread_spawn: { agent_role: null } } } } }),
      tokenCount(5),
      tokenCount(30),
    ].join('\n'));
    await writeFile(join(day, 'rollout-none.jsonl'), `${JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.5-sol' } })}\n`);
    const usage = (await collectProfile({ home, usage: true, now: FIXED_NOW })).codex?.usage;
    assert.equal(usage?.outputTokens, 250 + 40 + 30);
    assert.equal(usage?.sessions, 2);
  });
});

test('Pi output tokens: message.usage.output once per message key', async () => {
  await withHome(async (home) => {
    const sessions = join(home, '.pi', 'agent', 'sessions', '--proj--');
    await mkdir(sessions, { recursive: true });
    const message = (id: string, output: unknown) =>
      JSON.stringify({ type: 'message', id, timestamp: AT, message: { role: 'assistant', model: 'claude-opus-5-5', content: text('x'), usage: { input: 1, output } } });
    await writeFile(join(sessions, 'a.jsonl'), [message('m1', 11), message('m2', 'LEAK-not-a-number'), message('m3', 4)].join('\n'));
    // A forked copy repeats m1 with the same id and timestamp.
    await writeFile(join(sessions, 'b.jsonl'), [message('m1', 11), message('m4', 6)].join('\n'));
    assert.equal((await collectProfile({ home, usage: true, now: FIXED_NOW })).pi?.usage?.outputTokens, 11 + 4 + 6);
  });
});

test('fixture output tokens: Claude has none recorded, Codex 120, Pi 5 (a forked message counted once)', async () => {
  const { profile } = await scanFixture({ pi: true });
  assert.equal(profile.claudeCode?.usage?.outputTokens, 0);
  assert.equal(profile.codex?.usage?.outputTokens, 120);
  assert.equal(profile.pi?.usage?.outputTokens, 5);
});
