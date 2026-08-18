import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAICompatProvider, MockProvider, normalizeUsage } from '../scripts/providers.js';
import { ApproximateCounter } from '../scripts/token-count.js';

test('normalizeUsage maps OpenAI usage fields', () => {
  const usage = normalizeUsage({
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30,
    prompt_tokens_details: { cached_tokens: 5 },
    completion_tokens_details: { reasoning_tokens: 3 },
  });
  assert.deepEqual(usage, {
    input_tokens: 10,
    output_tokens: 20,
    total_tokens: 30,
    cached_input_tokens: 5,
    reasoning_tokens: 3,
  });
  assert.equal(normalizeUsage(undefined).total_tokens, 0);
});

test('OpenAICompatProvider parses chat completions', async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        model: 'm',
        choices: [{ message: { content: 'answer' } }],
        usage: { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  const provider = new OpenAICompatProvider({
    baseUrl: 'http://localhost:1234/v1/',
    apiKey: 'k',
    model: 'm',
    fetchImpl,
  });
  const result = await provider.complete({ model: 'm', prompt: 'hi', system: 'sys' });
  assert.equal(result.text, 'answer');
  assert.equal(result.usage.output_tokens, 2);
  assert.ok(result.latency_ms >= 0);
});

test('OpenAICompatProvider throws on non-ok responses', async () => {
  const fetchImpl = async () => new Response('nope', { status: 401 });
  const provider = new OpenAICompatProvider({ baseUrl: 'http://x/v1', apiKey: 'k', model: 'm', fetchImpl });
  await assert.rejects(() => provider.complete({ model: 'm', prompt: 'p' }), /401/);
});

test('MockProvider counts tokens deterministically', async () => {
  const counter = new ApproximateCounter();
  const provider = new MockProvider({
    model: 'm',
    tokenizer: counter,
    replyFor: (prompt) => `Answer: ${prompt}`,
  });
  const result = await provider.complete({ model: 'm', prompt: 'hello' });
  assert.ok(result.text.startsWith('Answer:'));
  assert.ok(result.usage.output_tokens > 0);
});
