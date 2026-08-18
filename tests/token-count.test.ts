import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApproximateCounter, TiktokenCounter, createCounter, isValidTokenizerKind } from '../scripts/token-count.js';

test('approximate counter returns 0 for empty text', () => {
  assert.equal(new ApproximateCounter().count(''), 0);
});

test('approximate counter returns >= 1 for non-empty text', () => {
  assert.ok(new ApproximateCounter().count('hello world') >= 1);
});

test('approximate counter scales with length', () => {
  const c = new ApproximateCounter();
  assert.ok(c.count('a'.repeat(400)) > c.count('a'.repeat(40)));
});

test('tiktoken counter counts known tokens', () => {
  const c = new TiktokenCounter();
  assert.equal(c.count(''), 0);
  const n = c.count('Hello, world!');
  assert.ok(n >= 3 && n <= 6, `expected ~4 tokens, got ${n}`);
});

test('createCounter and validator', () => {
  assert.equal(createCounter('approximate').name, 'approximate');
  assert.equal(createCounter('tiktoken').name, 'tiktoken');
  assert.ok(isValidTokenizerKind('tiktoken'));
  assert.ok(!isValidTokenizerKind('bogus'));
});
