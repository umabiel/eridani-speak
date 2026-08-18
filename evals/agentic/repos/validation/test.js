import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTransfer } from './src.js';

test('rejects invalid transfers', () => {
  assert.throws(() => createTransfer('a', 'b', -5), /amount/);
  assert.throws(() => createTransfer('a', 'b', 0), /amount/);
  assert.throws(() => createTransfer('', 'b', 10), /account/);
  assert.throws(() => createTransfer('a', '', 10), /account/);
  assert.deepEqual(createTransfer('a', 'b', 10), { from: 'a', to: 'b', amount: 10, status: 'pending' });
});
