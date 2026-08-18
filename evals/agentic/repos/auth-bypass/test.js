import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verify } from './src.js';

test('non-admin tokens cannot escalate to admin', () => {
  assert.deepEqual(verify('admin-token'), { role: 'admin' });
  assert.deepEqual(verify('user-token'), { role: 'user' });
  assert.equal(verify('notadmin'), null, 'substring match must not grant admin');
  assert.equal(verify(''), null);
  assert.equal(verify(undefined), null);
});
