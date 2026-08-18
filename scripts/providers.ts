export interface CompletionRequest {
  model: string;
  system?: string;
  prompt: string;
  temperature?: number;
}

export interface CompletionUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_input_tokens?: number;
  reasoning_tokens?: number;
}

export interface CompletionResult {
  text: string;
  usage: CompletionUsage;
  latency_ms: number;
  model: string;
}

export interface LLMProvider {
  readonly name: string;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

export interface OpenAICompatConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Default 120000. */
  timeoutMs?: number;
  /** Retries on 429/5xx/network errors. Default 2. */
  maxRetries?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && /fetch failed/i.test(error.message));
}

/**
 * OpenAI-compatible chat completions client. Works against OpenAI, OpenRouter,
 * and local servers (llama.cpp, LM Studio, Ollama /v1, vLLM).
 * Each attempt has a hard timeout; 429/5xx and network failures are retried
 * with exponential backoff. Timeouts are NOT retried — a model that exceeds
 * the timeout is slow, not transient.
 */
export class OpenAICompatProvider implements LLMProvider {
  readonly name = 'openai-compatible';

  constructor(private readonly config: OpenAICompatConfig) {}

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const timeoutMs = this.config.timeoutMs ?? 120_000;
    const maxRetries = this.config.maxRetries ?? 2;
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const url = `${stripTrailingSlash(this.config.baseUrl)}/chat/completions`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };
    const body = JSON.stringify({
      model: request.model,
      messages: [
        ...(request.system ? [{ role: 'system' as const, content: request.system }] : []),
        { role: 'user' as const, content: request.prompt },
      ],
      temperature: request.temperature ?? 0,
    });

    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = 1_000 * 2 ** (attempt - 1);
        await sleep(delay);
      }
      const started = Date.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response: Response;
        try {
          response = await fetchImpl(url, { method: 'POST', headers, body, signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          const error = new Error(`Provider HTTP ${response.status}: ${detail.slice(0, 500)}`);
          if (isRetryableStatus(response.status)) {
            lastError = error;
            continue;
          }
          throw error;
        }
        const data = (await response.json()) as Record<string, unknown>;
        const choices = data.choices as Array<{ message?: { content?: unknown } }> | undefined;
        const content = choices?.[0]?.message?.content;
        const text = typeof content === 'string' ? content : '';
        return {
          text,
          usage: normalizeUsage(data.usage),
          latency_ms: Date.now() - started,
          model: typeof data.model === 'string' ? data.model : request.model,
        };
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`Provider request timed out after ${timeoutMs}ms`);
        }
        if (isNetworkError(error) && attempt < maxRetries) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Provider request failed after retries');
  }
}

export function normalizeUsage(usage: unknown): CompletionUsage {
  const u = (usage ?? {}) as Record<string, unknown>;
  const promptDetails = (u.prompt_tokens_details ?? {}) as Record<string, unknown>;
  const completionDetails = (u.completion_tokens_details ?? {}) as Record<string, unknown>;
  const input = Number(u.prompt_tokens ?? 0);
  const output = Number(u.completion_tokens ?? 0);
  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: Number(u.total_tokens ?? input + output),
    cached_input_tokens: typeof promptDetails.cached_tokens === 'number' ? promptDetails.cached_tokens : undefined,
    reasoning_tokens:
      typeof completionDetails.reasoning_tokens === 'number' ? completionDetails.reasoning_tokens : undefined,
  };
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export interface MockConfig {
  model: string;
  tokenizer: { count(text: string): number };
  /** Deterministic reply for tests/demos; default echoes the prompt. */
  replyFor?: (prompt: string) => string;
  /** Simulated failures for tests: throw this many times before succeeding. */
  failTimes?: number;
}

/** Offline deterministic provider for tests, demos, and CI. */
export class MockProvider implements LLMProvider {
  readonly name = 'mock';
  private failures = 0;

  constructor(private readonly config: MockConfig) {}

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    if (this.config.failTimes && this.failures < this.config.failTimes) {
      this.failures += 1;
      throw new Error('Mock transient failure');
    }
    const text = this.config.replyFor
      ? this.config.replyFor(request.prompt)
      : `Mock response to: ${request.prompt.slice(0, 80)}`;
    const systemTokens = request.system ? this.config.tokenizer.count(request.system) : 0;
    const input_tokens = systemTokens + this.config.tokenizer.count(request.prompt);
    const output_tokens = this.config.tokenizer.count(text);
    return {
      text,
      usage: { input_tokens, output_tokens, total_tokens: input_tokens + output_tokens },
      latency_ms: 1,
      model: request.model,
    };
  }
}
