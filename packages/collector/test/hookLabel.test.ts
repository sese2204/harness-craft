import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hookLabel } from '../src/hookLabel.js';

const cmd = (command: string) => hookLabel({ type: 'command', command });

test('spec examples', () => {
  assert.equal(cmd('"/Applications/AgentPet.app/Contents/MacOS/agentpet" hook --'), 'agentpet');
  assert.equal(cmd('node /Users/x/.config/clauseum/codex-hook-stop.js'), 'codex-hook-stop.js');
  assert.equal(cmd('if [ -z "$HOME" ]; then echo hi; fi'), 'inline');
});

test('leading KEY=value assignments are skipped', () => {
  assert.equal(cmd('FOO=1 BAR="a b" ~/.claude/hooks/notify.sh --x'), 'notify.sh');
  assert.equal(cmd("TOKEN='s e c' python3 -u /opt/h/run.py arg"), 'run.py');
  assert.equal(cmd('A=1'), 'inline');
});

test('non-command handler types use the type as label', () => {
  assert.equal(hookLabel({ type: 'prompt' }), 'prompt');
  assert.equal(hookLabel({ type: 'http', command: 'ignored' }), 'http');
});

test('other shell syntax and inline code become inline', () => {
  for (const c of [': noop', '[ -f x ] && y', 'case $X in a) ;; esac', 'bash -lc "echo hi"', 'node -e "1"', 'python -c "x"', '']) {
    assert.equal(cmd(c), 'inline', c);
  }
});

test('plain commands and interpreters with flags', () => {
  assert.equal(cmd('agentpet-hook stop'), 'agentpet-hook');
  assert.equal(cmd('bash -e ~/hooks/guard.sh'), 'guard.sh');
  assert.equal(cmd('npx -y some-hook-pkg'), 'some-hook-pkg');
  assert.equal(cmd('bun run scripts/hook.ts'), 'hook.ts');
  assert.equal(cmd('/usr/bin/python3 /x/y.py | tee log'), 'y.py');
  assert.equal(cmd('node'), 'inline');
});
