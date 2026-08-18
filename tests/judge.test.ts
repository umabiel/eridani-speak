import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseJudgeJson,
  buildJudgePrompt,
  judgeScoreMean,
  judgeCase,
} from '../scripts/judge.js';
import { MockProvider } from '../scripts/providers.js';
import { ApproximateCounter } from '../scripts/token-count.js';
import type { EvalFixture } from '../scripts/fixtures.js';

test('parseJudgeJson parses a clean JSON rubric', () => {
  const scores = parseJudgeJson(
    '{"correctness":4,"completeness":3,"constraints_preserved":5,"uncertainty_preserved":2,"tradeoffs_preserved":1,"actionability":4,"unnecessary_verbosity":5}',
  );
  assert.equal(scores?.correctness, 4);
  assert.equal(scores?.constraints_preserved, 5);
  assert.equal(scores?.unnecessary_verbosity, 5);
});

test('parseJudgeJson tolerates markdown fences and prose', () => {
  const scores = parseJudgeJson('Here are my scores:\n\n```json\n{"correctness":3,"completeness":2,"constraints_preserved":1,"uncertainty_preserved":1,"tradeoffs_preserved":2,"actionability":3,"unnecessary_verbosity":4}\n```\nDone.');
  assert.equal(scores?.correctness, 3);
  assert.equal(scores?.actionability, 3);
});

test('parseJudgeJson returns null on garbage', () => {
  assert.equal(parseJudgeJson('I cannot score this'), null);
  assert.equal(parseJudgeJson('{"correctness":"maybe"}'), null);
});

test('parseJudgeJson clamps out-of-range values', () => {
  const scores = parseJudgeJson(
    '{"correctness":99,"completeness":-3,"constraints_preserved":4,"uncertainty_preserved":0,"tradeoffs_preserved":0,"actionability":0,"unnecessary_verbosity":0}',
  );
  assert.equal(scores?.correctness, 5);
  assert.equal(scores?.completeness, 0);
});

test('judgeScoreMean normalizes to 0-1', () => {
  const scores = parseJudgeJson(
    '{"correctness":5,"completeness":5,"constraints_preserved":5,"uncertainty_preserved":5,"tradeoffs_preserved":5,"actionability":5,"unnecessary_verbosity":5}',
  )!;
  assert.equal(judgeScoreMean(scores), 1);
});

test('buildJudgePrompt includes task, facts, nuances, and rubric', () => {
  const fixture: EvalFixture = {
    id: 'x',
    category: 'debugging',
    prompt: 'Debug X',
    expected_facts: ['root cause'],
    forbidden_loss: ['keep the constraint'],
  };
  const prompt = buildJudgePrompt(fixture, 'The answer');
  assert.ok(prompt.includes('Debug X'));
  assert.ok(prompt.includes('root cause'));
  assert.ok(prompt.includes('keep the constraint'));
  assert.ok(prompt.includes('The answer'));
  assert.ok(prompt.includes('correctness'));
});

test('judgeCase parses a mock judge response', async () => {
  const provider = new MockProvider({
    model: 'm',
    tokenizer: new ApproximateCounter(),
    replyFor: () =>
      '{"correctness":4,"completeness":4,"constraints_preserved":3,"uncertainty_preserved":3,"tradeoffs_preserved":3,"actionability":4,"unnecessary_verbosity":4}',
  });
  const fixture: EvalFixture = {
    id: 'x',
    category: 'debugging',
    prompt: 'Debug X',
    expected_facts: [],
    forbidden_loss: [],
  };
  const { scores } = await judgeCase(provider, 'm', fixture, 'response text');
  assert.equal(scores?.correctness, 4);
});
