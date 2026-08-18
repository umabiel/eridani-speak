import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setCached, getCached } from './src.js';

test('new version invalidates stale cache entries', () => {
  setCached('config', 'v1', { a: 1 });
  assert.deepEqual(getCached('config', 'v1'), { a: 1 });
  // Deploy bumps the version: v1 data must not be served for v2.
  assert.equal(getCached('config', 'v2'), null, 'stale version must not be served');
  setCached('config', 'v2', { a: 2 });
  assert.deepEqual(getCached('config', 'v2'), { a: 2 });
  assert.deepEqual(getCached('config', 'v1'), { a: 1 });
});
