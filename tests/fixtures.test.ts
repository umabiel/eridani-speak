import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, loadFixtures, validateAllFixtures, validateFixture } from '../scripts/fixtures.js';

test('every category has at least 5 fixtures', () => {
  for (const category of CATEGORIES) {
    const fixtures = loadFixtures(category);
    assert.ok(fixtures.length >= 5, `${category} should have >= 5 fixtures, got ${fixtures.length}`);
  }
});

test('all fixtures validate and ids are unique', () => {
  const { fixtures, errors } = validateAllFixtures();
  assert.equal(errors.size, 0, `Fixture errors: ${JSON.stringify([...errors])}`);
  const ids = new Set(fixtures.map((f) => f.id));
  assert.equal(ids.size, fixtures.length);
});

test('validateFixture flags bad input', () => {
  assert.ok(validateFixture({ id: 'x' }).length > 0);
  assert.ok(
    validateFixture({ id: 'x', category: 'c', prompt: 'p', expected_facts: 'nope', forbidden_loss: [] }).length > 0,
  );
  assert.equal(
    validateFixture({ id: 'x', category: 'c', prompt: 'p', expected_facts: [], forbidden_loss: [] }).length,
    0,
  );
});
