import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { SHARE_DATA_ID, SHARE_PLACEHOLDER, SHARE_ROOT_ID } from '../src/shareFormat.js';
import { fillShareTemplate } from '../src/shareHtml.js';
import { scanFixture } from './helpers.js';

const TEMPLATE_URL = new URL('../dist/share-template.html', import.meta.url);
const MAX_TEMPLATE_BYTES = 400 * 1024;

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

test('built template: one placeholder, one data script, fonts inlined, under the size limit', async () => {
  const html = await readFile(TEMPLATE_URL, 'utf8');
  assert.equal(count(html, SHARE_PLACEHOLDER), 1);
  assert.equal(count(html, `<script type="application/json" id="${SHARE_DATA_ID}">${SHARE_PLACEHOLDER}</script>`), 1);
  assert.equal(count(html, `id="${SHARE_ROOT_ID}"`), 1);
  assert.match(html, /<meta charset="utf-8">/);
  assert.equal(count(html, 'data:font/woff2;base64,'), 2);
  assert.match(html, /--font-press-start:/);
  assert.match(html, /--font-neodgm:/);
  assert.match(html, /prefers-reduced-motion/);
  assert.equal(/\b(src|href)="https?:/.test(html), false, 'no external resources');
  assert.ok(Buffer.byteLength(html) <= MAX_TEMPLATE_BYTES, `${Buffer.byteLength(html)} bytes`);
});

test('a name with </script> does not add script elements to the built template', async () => {
  const template = await readFile(TEMPLATE_URL, 'utf8');
  const { profile } = await scanFixture({ usage: false });
  const evil = '</script><script>alert(1)</script>';
  const c = profile.claudeCode;
  assert.ok(c);
  const poisoned = { ...profile, claudeCode: { ...c, skills: [...c.skills, { ...c.skills[0]!, name: evil, description: evil }] } };
  const html = fillShareTemplate(template, { handle: 'x', profile: poisoned });
  assert.equal(count(html.toLowerCase(), '<script'), count(template.toLowerCase(), '<script'));
  assert.equal(count(html.toLowerCase(), '</script'), count(template.toLowerCase(), '</script'));
});
