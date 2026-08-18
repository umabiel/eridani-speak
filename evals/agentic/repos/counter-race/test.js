import { test } from 'node:test';
import assert from 'node:assert/strict';
import { increment, read } from './src.js';

test('concurrent increments are not lost', async () => {
  const key = 'likes';
  await Promise.all(Array.from({ length: 50 }, () => increment(key)));
  assert.equal(await read(key), 50);
});
