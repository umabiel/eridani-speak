import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCode } from '../scripts/agentic-run.js';

test('extractCode takes the last fenced block', () => {
  const response = [
    'Here is the fixed file:',
    '```js',
    'export const x = 1;',
    '```',
    '',
    '```js',
    'export const x = 2;',
    '```',
  ].join('\n');
  assert.equal(extractCode(response), 'export const x = 2;');
});

test('extractCode handles javascript fence language', () => {
  const response = '```javascript\nexport function f() { return 1; }\n```';
  assert.equal(extractCode(response), 'export function f() { return 1; }');
});

test('extractCode falls back to bare code', () => {
  const response = 'export function f() { return 1; }';
  assert.equal(extractCode(response), 'export function f() { return 1; }');
});

test('extractCode returns null for prose', () => {
  assert.equal(extractCode('I fixed the bug by making the increment atomic.'), null);
  assert.equal(extractCode(''), null);
});
