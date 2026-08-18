import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getUsers, queryCount } from './src.js';

test('bulk lookup does not query per row', () => {
  const ids = [1, 2, 3, 1, 2, 3];
  const result = getUsers(ids);
  assert.deepEqual(result, ['alice', 'bob', 'carol', 'alice', 'bob', 'carol']);
  assert.ok(queryCount() <= 2, 'bulk lookup must not issue a query per row');
});
