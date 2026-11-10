import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Redactor, redactText } from '../src/redact.js';
import { FAKE_AWS, FAKE_GHP_SHORT, FAKE_GITHUB_PAT, FAKE_SK_PLAIN, FAKE_SLACK } from './fakeTokens.js';

test('secrets: each pattern is replaced and counted', () => {
  const samples = [
    FAKE_SK_PLAIN,
    FAKE_GHP_SHORT,
    FAKE_GITHUB_PAT,
    FAKE_SLACK,
    FAKE_AWS,
    'eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2Q',
    'a'.repeat(32),
    'Bearer abcdefghijklmnopqr',
  ];
  for (const s of samples) {
    const r = redactText(`x ${s} y`);
    assert.equal(r.text, 'x <secret> y', s);
    assert.equal(r.counts.secrets, 1, s);
  }
  assert.equal(redactText('31 hex ' + 'a'.repeat(31)).counts.secrets, 0);
});

test('urls keep the hostname only', () => {
  const r = redactText('see https://docs.example.com/a/b?token=x and http://localhost:3000/p');
  assert.equal(r.text, 'see docs.example.com and localhost');
  assert.equal(r.counts.urls, 2);
});

test('emails are replaced', () => {
  const r = redactText('ping a.b+c@example.co.kr or x@y.io');
  assert.equal(r.text, 'ping <email> or <email>');
  assert.equal(r.counts.emails, 2);
});

test('home paths become ~ for macOS, Linux and Windows', () => {
  const r = redactText('/Users/kim/a.md /home/lee/b C:\\Users\\park\\c.txt');
  assert.equal(r.text, '~/a.md ~/b ~\\c.txt');
  assert.equal(r.counts.paths, 3);
});

test('a non-standard home given to the redactor is also masked', () => {
  const r = redactText('/srv/me/x and /srv/meow', { home: '/srv/me' });
  assert.equal(r.text, '~/x and /srv/meow');
  assert.equal(r.counts.paths, 1);
});

test('order: secrets before urls, urls before emails', () => {
  const r = redactText(`https://user@host.example.com/${FAKE_SK_PLAIN}`);
  assert.equal(r.text, 'host.example.com');
  assert.deepEqual(r.counts, { paths: 0, emails: 0, secrets: 1, urls: 1 });
});

test('whitespace collapses and long text is cut at 280 with an ellipsis', () => {
  assert.equal(redactText('  a \n\n b\t c ').text, 'a b c');
  const long = redactText('가'.repeat(300)).text;
  assert.equal(Array.from(long).length, 281);
  assert.ok(long.endsWith('…'));
  assert.equal(redactText('x'.repeat(280)).text.length, 280);
});

test('Redactor accumulates counts across calls', () => {
  const r = new Redactor();
  r.text('a@b.com');
  r.text('https://x.com/y /Users/q/z');
  assert.deepEqual(r.totals(), { paths: 1, emails: 1, secrets: 0, urls: 1 });
});
