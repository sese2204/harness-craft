import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseFrontmatter } from '../src/frontmatter.js';

test('valid YAML frontmatter', () => {
  const fm = parseFrontmatter('---\nname: a\ntools:\n  - Read\n---\nbody');
  assert.deepEqual(fm, { data: { name: 'a', tools: ['Read'] }, error: null });
});

test('no frontmatter yields empty data', () => {
  assert.deepEqual(parseFrontmatter('# title\nbody'), { data: {}, error: null });
});

test('unquoted colon in a value falls back to top-level key: value lines', () => {
  const fm = parseFrontmatter('---\nname: x\ndescription: does a: then b\nmodel: "opus"\n---\nbody');
  assert.deepEqual(fm, { data: { name: 'x', description: 'does a: then b', model: 'opus' }, error: null });
});

test('unrecoverable frontmatter reports an error', () => {
  const fm = parseFrontmatter('---\n[unclosed\n---\n');
  assert.deepEqual(fm.data, {});
  assert.match(fm.error ?? '', /frontmatter YAML 파싱 실패/);
});
