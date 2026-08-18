import { test } from 'node:test';
import assert from 'node:assert/strict';
import { charge } from './src.js';

test('duplicate submissions produce exactly one charge', async () => {
  const order = { idempotencyKey: 'k1', amount: 10 };
  const first = await charge(order);
  const second = await charge(order);
  assert.equal(first.charged, 10);
  assert.equal(second.charged, 0, 'duplicate must not charge again');
  assert.equal(second.key, 'k1');
});
