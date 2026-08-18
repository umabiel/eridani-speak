import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAICompatProvider } from '../scripts/providers.js';

function okResponse(body = '{"model":"m","choices":[{"message":{"content":"hi"}}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}') {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

test('provider times out when the request hangs', async () => {
  const fetchImpl = (_url: string | URL | Request, opts?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      opts?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
  const provider = new OpenAICompatProvider({
    baseUrl: 'http://x/v1',
    apiKey: 'k',
    model: 'm',
    timeoutMs: 50,
    fetchImpl,
  });
  await assert.rejects(() => provider.complete({ model: 'm', prompt: 'p' }), /timed out after 50ms/);
});

test('provider retries 429 then succeeds', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls < 3) return new Response('rate limited', { status: 429 });
    return okResponse();
  };
  const provider = new OpenAICompatProvider({ baseUrl: 'http://x/v1', apiKey: 'k', model: 'm', maxRetries: 2, fetchImpl });
  const result = await provider.complete({ model: 'm', prompt: 'p' });
  assert.equal(result.text, 'hi');
  assert.equal(calls, 3);
});

test('provider retries 5xx then succeeds', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return new Response('boom', { status: 503 });
    return okResponse();
  };
  const provider = new OpenAICompatProvider({ baseUrl: 'http://x/v1', apiKey: 'k', model: 'm', maxRetries: 1, fetchImpl });
  const result = await provider.complete({ model: 'm', prompt: 'p' });
  assert.equal(result.text, 'hi');
  assert.equal(calls, 2);
});

test('provider does not retry 4xx', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response('bad request', { status: 400 });
  };
  const provider = new OpenAICompatProvider({ baseUrl: 'http://x/v1', apiKey: 'k', model: 'm', maxRetries: 2, fetchImpl });
  await assert.rejects(() => provider.complete({ model: 'm', prompt: 'p' }), /400/);
  assert.equal(calls, 1);
});

test('provider retries network errors', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('fetch failed');
    return okResponse();
  };
  const provider = new OpenAICompatProvider({ baseUrl: 'http://x/v1', apiKey: 'k', model: 'm', maxRetries: 1, fetchImpl });
  const result = await provider.complete({ model: 'm', prompt: 'p' });
  assert.equal(result.text, 'hi');
  assert.equal(calls, 2);
});

test('provider gives up after exhausting retries', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response('nope', { status: 503 });
  };
  const provider = new OpenAICompatProvider({ baseUrl: 'http://x/v1', apiKey: 'k', model: 'm', maxRetries: 1, fetchImpl });
  await assert.rejects(() => provider.complete({ model: 'm', prompt: 'p' }), /503/);
  assert.equal(calls, 2);
});

