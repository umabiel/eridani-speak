import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnvFile } from './env.js';
import { createCounter, isValidTokenizerKind, type TokenCounter } from './token-count.js';
import { OpenAICompatProvider, MockProvider, type LLMProvider, type CompletionResult } from './providers.js';
import { CATEGORIES, loadFixtures, type EvalFixture } from './fixtures.js';
import { aggregate, scoreQuality, type Aggregate, type CaseResult } from './metrics.js';
import { simulateConversation, type SimPoint } from './conversation-sim.js';
import { parseSkillFile } from './frontmatter.js';
import { renderReport, type RunResultFile } from './report.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

interface CliOptions {
  suite?: string;
  mode?: string;
  model?: string;
  maxCases?: number;
  mock: boolean;
  systemPrompt?: string;
  out?: string;
  temperature?: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { mock: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = (): string | undefined => {
      i += 1;
      return argv[i];
    };
    switch (arg) {
      case '--suite': opts.suite = value(); break;
      case '--mode': opts.mode = value(); break;
      case '--model': opts.model = value(); break;
      case '--max-cases': opts.maxCases = Number(value()); break;
      case '--system-prompt': opts.systemPrompt = value(); break;
      case '--out': opts.out = value(); break;
      case '--temperature': opts.temperature = Number(value()); break;
      case '--mock': opts.mock = true; break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return opts;
}

function buildCaseResult(
  fixture: EvalFixture,
  mode: string,
  result: CompletionResult,
  systemPrompt: string | undefined,
  counter: TokenCounter,
): CaseResult {
  const systemTokens = systemPrompt ? counter.count(systemPrompt) : 0;
  const promptTokens = counter.count(`${systemPrompt ? `${systemPrompt}\n` : ''}${fixture.prompt}`);
  const input_tokens = result.usage.input_tokens || promptTokens;
  const prompt_input_tokens = Math.max(0, input_tokens - systemTokens);
  const output_tokens = result.usage.output_tokens || counter.count(result.text);
  const total_tokens = result.usage.total_tokens || input_tokens + output_tokens;
  const quality = scoreQuality(result.text, fixture);
  return {
    fixtureId: fixture.id,
    category: fixture.category,
    mode,
    output: result.text,
    input_tokens,
    prompt_input_tokens,
    output_tokens,
    total_tokens,
    cached_input_tokens: result.usage.cached_input_tokens,
    reasoning_tokens: result.usage.reasoning_tokens,
    latency_ms: result.latency_ms,
    ...quality,
  };
}

async function main(): Promise<void> {
  loadEnvFile();
  const opts = parseArgs(process.argv.slice(2));
  const model = opts.model ?? process.env.LLM_MODEL ?? 'gpt-4o-mini';
  const tokenizerKind = process.env.LLM_TOKENIZER ?? 'approximate';
  if (!isValidTokenizerKind(tokenizerKind)) {
    console.error(`Invalid LLM_TOKENIZER '${tokenizerKind}'. Use 'approximate' or 'tiktoken'.`);
    process.exit(1);
  }
  const counter = createCounter(tokenizerKind);

  const suite = opts.suite ?? 'all';
  if (suite !== 'all' && !(CATEGORIES as readonly string[]).includes(suite)) {
    console.error(`Unknown suite '${suite}'. Valid suites: ${CATEGORIES.join(', ')} or 'all'.`);
    process.exit(1);
  }
  const fixtures = loadFixtures(suite === 'all' ? undefined : suite);
  const selected = opts.maxCases ? fixtures.slice(0, opts.maxCases) : fixtures;
  if (!selected.length) {
    console.error('No fixtures matched.');
    process.exit(1);
  }

  // Mock mode: reply with the fixture's reference_answer when present, so the
  // offline demo exercises the real scoring pipeline instead of random text.
  const provider: LLMProvider = opts.mock
    ? new MockProvider({
        model,
        tokenizer: counter,
        replyFor: (prompt) => {
          const fixture = selected.find((f) => f.prompt === prompt);
          return fixture?.reference_answer ?? `Mock response to: ${prompt.slice(0, 80)}`;
        },
      })
    : new OpenAICompatProvider({
        baseUrl: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
        apiKey: process.env.LLM_API_KEY ?? '',
        model,
      });

  if (!opts.mock && !process.env.LLM_API_KEY) {
    console.error(
      'No LLM_API_KEY set.\n' +
        '  Export LLM_API_KEY (optionally LLM_BASE_URL, LLM_MODEL, LLM_TOKENIZER), or\n' +
        '  run with --mock for an offline deterministic run (no real model).\n' +
        '  See .env.example and evals/README.md.',
    );
    process.exit(1);
  }

  const modes =
    opts.mode === 'normal' || opts.mode === 'signal-coding' ? [opts.mode] : ['normal', 'signal-coding'];
  const signalDoc = parseSkillFile(join(REPO_ROOT, 'signal-coding', 'SKILL.md'));
  const systemPrompt = opts.systemPrompt ?? signalDoc.body;
  if (modes.includes('signal-coding')) {
    console.log(`Signal Coding system prompt: "${signalDoc.name}" (~${counter.count(systemPrompt)} tokens)`);
  }

  const runs: RunResultFile[] = [];
  for (const mode of modes) {
    console.log(`\nRunning mode: ${mode} (${selected.length} cases, model=${model})`);
    const cases: CaseResult[] = [];
    for (const fixture of selected) {
      const result = await provider.complete({
        model,
        system: mode === 'signal-coding' ? systemPrompt : undefined,
        prompt: fixture.prompt,
        temperature: opts.temperature ?? 0,
      });
      const caseResult = buildCaseResult(
        fixture,
        mode,
        result,
        mode === 'signal-coding' ? systemPrompt : undefined,
        counter,
      );
      cases.push(caseResult);
      console.log(
        `  [${mode}] ${caseResult.fixtureId}: out=${caseResult.output_tokens} tok, quality=${caseResult.quality_score.toFixed(2)}`,
      );
    }
    const agg: Aggregate = aggregate(cases);
    // Per-turn input excludes the system prompt; the system prompt is charged
    // once per session (initialTokens), matching cached-prompt pricing.
    const perTurn = {
      input_tokens: agg.n ? agg.prompt_input_tokens / agg.n : 0,
      output_tokens: agg.n ? agg.output_tokens / agg.n : 0,
    };
    const initialTokens = mode === 'signal-coding' && agg.n ? agg.system_prompt_tokens / agg.n : 0;
    const conversation_sim: SimPoint[] = simulateConversation(perTurn, [5, 10, 20, 40], { initialTokens });
    runs.push({
      generated_at: new Date().toISOString(),
      model,
      tokenizer: tokenizerKind,
      suite,
      mode,
      provider: provider.name,
      n_cases: cases.length,
      aggregate: agg,
      conversation_sim,
      cases,
    });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outBase = opts.out ?? join(REPO_ROOT, 'results', stamp);
  mkdirSync(dirname(outBase), { recursive: true });
  const written: string[] = [];
  for (const run of runs) {
    const file = `${outBase}.${run.mode}.json`;
    writeFileSync(file, JSON.stringify(run, null, 2));
    written.push(file);
  }
  const markdown = renderReport({
    model,
    suite,
    normal: runs.find((r) => r.mode === 'normal'),
    signal: runs.find((r) => r.mode === 'signal-coding'),
    single: runs.length === 1 ? runs[0] : undefined,
  });
  const mdFile = `${outBase}.report.md`;
  writeFileSync(mdFile, markdown);
  written.push(mdFile);
  console.log(`\nWrote:\n  ${written.join('\n  ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
