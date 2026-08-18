import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReport, formatPct, formatDelta, type RunResultFile } from '../scripts/report.js';
import type { Aggregate } from '../scripts/metrics.js';

function makeAggregate(over: Partial<Aggregate>): Aggregate {
  return {
    n: 10,
    input_tokens: 10000,
    prompt_input_tokens: 10000,
    system_prompt_tokens: 0,
    output_tokens: 2000,
    total_tokens: 12000,
    cached_input_tokens: 0,
    reasoning_tokens: 0,
    mean_latency_ms: 500,
    quality_score: 0.9,
    critical_fact_recall: 0.95,
    constraint_recall: 0.9,
    task_success_rate: 1,
    tasks_succeeded: 10,
    ...over,
  };
}

function makeRun(mode: string, over: Partial<Aggregate> = {}): RunResultFile {
  const simPoint = (turns: number, cumulative: number) => ({
    turns,
    cumulative_input_tokens: cumulative,
    cumulative_output_tokens: cumulative / 5,
    cumulative_total_tokens: cumulative + cumulative / 5,
    context_size_at_end: cumulative + cumulative / 5,
    context_sizes: [],
  });
  return {
    generated_at: '2025-01-01T00:00:00.000Z',
    model: 'm',
    tokenizer: 'approximate',
    suite: 'debugging',
    mode,
    provider: 'mock',
    n_cases: 10,
    aggregate: makeAggregate(over),
    conversation_sim: [simPoint(5, 10000), simPoint(10, 20000), simPoint(20, 40000), simPoint(40, 80000)],
    cases: [],
  };
}

test('renderReport builds a comparison table with deltas', () => {
  const normal = makeRun('normal');
  const signal = makeRun('signal-coding', { output_tokens: 800, total_tokens: 10800, quality_score: 0.88 });
  const md = renderReport({ model: 'm', suite: 'debugging', normal, signal });
  assert.ok(md.includes('# Evaluation Report'));
  assert.ok(md.includes('Signal Coding'));
  assert.ok(md.includes('40.0%'), 'compression ratio 800/2000 should show 40.0%');
  assert.ok(md.includes('+60.0%'), 'output token savings should show +60.0%');
});

test('renderReport handles a single run', () => {
  const single = makeRun('normal');
  const md = renderReport({ model: 'm', suite: 'debugging', single });
  assert.ok(md.includes('# Evaluation Report'));
  assert.ok(md.includes('Output tokens'));
  assert.ok(md.includes('12000'));
});

test('format helpers', () => {
  assert.equal(formatPct(0.123), '12.3%');
  assert.equal(formatPct(null), 'n/a');
  assert.equal(formatDelta(-0.5), '-50.0%');
  assert.equal(formatDelta(0.25), '+25.0%');
});
