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
}

/**
 * OpenAI-compatible chat completions client. Works against OpenAI, OpenRouter,
 * and local servers (llama.cpp, LM Studio, Ollama /v1, vLLM).
 */
export class OpenAICompatProvider implements LLMProvider {
  readonly name = 'openai-compatible';

  constructor(private readonly config: OpenAICompatConfig) {}

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const started = Date.now();
    const messages = [
      ...(request.system ? [{ role: 'system' as const, content: request.system }] : []),
      { role: 'user' as const, content: request.prompt },
    ];
    const body = {
      model: request.model,
      messages,
      temperature: request.temperature ?? 0,
    };
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const response = await fetchImpl(`${stripTrailingSlash(this.config.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Provider HTTP ${response.status}: ${detail.slice(0, 500)}`);
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
}

/** Offline deterministic provider for tests, demos, and CI. */
export class MockProvider implements LLMProvider {
  readonly name = 'mock';

  constructor(private readonly config: MockConfig) {}

  async complete(request: CompletionRequest): Promise<CompletionResult> {
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
