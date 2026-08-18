import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contains,
  recall,
  scoreQuality,
  aggregate,
  compressionRatio,
  tokenSavings,
  contextSavings,
  utilityPerToken,
  tasksPerMillionTokens,
} from '../scripts/metrics.js';
import type { CaseResult } from '../scripts/metrics.js';

test('contains is case-insensitive and whitespace tolerant', () => {
  assert.ok(contains('Check session.revokedAt before issuing tokens.', 'session.revokedAt'));
  assert.ok(contains('FIX:  validate   session.revokedAt', 'fix: validate session.revokedAt'));
  assert.ok(!contains('nothing here', 'redis'));
});

test('recall is the fraction of present facts', () => {
  assert.equal(recall('a b c', ['a', 'b', 'zzz']), 2 / 3);
  assert.equal(recall('anything', []), 1);
});

test('scoreQuality rewards preserved facts and constraints', () => {
  const fixture = {
    id: 'x',
    category: 'debugging',
    prompt: 'p',
    expected_facts: ['root cause', 'fix'],
    forbidden_loss: ['assumption: single writer', 'unless idempotent'],
  };
  const full = scoreQuality('Root cause: X. Fix: Y. Assumption: single writer. Only retry unless idempotent.', fixture);
  assert.equal(full.critical_fact_recall, 1);
  assert.equal(full.constraint_recall, 1);
  assert.ok(full.quality_score > 0.95);
  const partial = scoreQuality('root cause only', fixture);
  assert.equal(partial.critical_fact_recall, 0.5);
  assert.equal(partial.constraint_recall, 0);
});

test('scoreQuality grades task success from criteria', () => {
  const fixture = {
    id: 'x',
    category: 'agentic',
    prompt: 'p',
    expected_facts: [],
    forbidden_loss: [],
    task_success_criteria: ['atomic increment', 'no read-modify-write race'],
  };
  assert.equal(scoreQuality('use atomic increment, no read-modify-write race', fixture).task_success, true);
  assert.equal(scoreQuality('increment the counter', fixture).task_success, false);
});

test('aggregate sums tokens and averages quality', () => {
  const mk = (over: Partial<CaseResult>): CaseResult => ({
    fixtureId: 'a',
    category: 'debugging',
    mode: 'normal',
    output: '',
    input_tokens: 100,
    prompt_input_tokens: 100,
    output_tokens: 50,
    total_tokens: 150,
    latency_ms: 10,
    critical_fact_recall: 1,
    constraint_recall: 1,
    quality_score: 1,
    task_success: true,
    ...over,
  });
  const agg = aggregate([mk({ output_tokens: 50 }), mk({ output_tokens: 150, quality_score: 0.5 })]);
  assert.equal(agg.output_tokens, 200);
  assert.equal(agg.quality_score, 0.75);
  assert.equal(agg.tasks_succeeded, 2);
  assert.equal(agg.task_success_rate, 1);
  assert.equal(agg.n, 2);
});

test('derived metrics', () => {
  assert.equal(compressionRatio(100, 200), 0.5);
  assert.equal(tokenSavings(100, 200), 0.5);
  assert.equal(contextSavings(1000, 2000), 0.5);
  assert.equal(compressionRatio(100, 0), null);
  assert.ok(utilityPerToken(0.9, 1000) < utilityPerToken(0.9, 500));
  assert.equal(tasksPerMillionTokens(2, 1000), 2000);
});
