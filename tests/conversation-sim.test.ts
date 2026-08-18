import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateConversation, contextGrowthRate } from '../scripts/conversation-sim.js';

test('cumulative totals grow linearly with turns', () => {
  const points = simulateConversation({ input_tokens: 100, output_tokens: 50 }, [5, 10, 20, 40]);
  assert.equal(points.length, 4);
  assert.equal(points[0].cumulative_total_tokens, 750);
  assert.equal(points[3].cumulative_total_tokens, 6000);
  assert.equal(points[3].context_size_at_end, 6000);
});

test('context growth rate is tokens per turn', () => {
  const points = simulateConversation({ input_tokens: 100, output_tokens: 50 }, [5, 10, 20, 40]);
  assert.equal(contextGrowthRate(points), 150);
});

test('context sizes accumulate per turn', () => {
  const points = simulateConversation({ input_tokens: 10, output_tokens: 5 }, [3]);
  assert.deepEqual(points[0].context_sizes, [15, 30, 45]);
});
