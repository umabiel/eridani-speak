import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnvFile } from './env.js';
import { OpenAICompatProvider, MockProvider, type LLMProvider, type CompletionResult } from './providers.js';
import { parseSkillFile } from './frontmatter.js';
import { createCounter } from './token-count.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const AGENTIC_DIR = join(REPO_ROOT, 'evals', 'agentic');

export interface AgenticTask {
  id: string;
  dir: string;
  title: string;
  prompt: string;
}

export interface AgenticResult {
  id: string;
  mode: string;
  success: boolean;
  iterations: number;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  test_tail: string;
  error?: string;
}

const DEFAULT_PROMPT =
  'Fix the bug in src.js. The test suite in test.js currently fails. Requirements: make all tests in test.js pass; do not modify test.js; do not add dependencies; keep the same exported function names and signatures.';

function loadTasks(): AgenticTask[] {
  const manifest = JSON.parse(readFileSync(join(AGENTIC_DIR, 'tasks.json'), 'utf8')) as Array<{
    id: string;
    dir: string;
    title: string;
    prompt?: string;
  }>;
  return manifest.map((t) => ({
    id: t.id,
    dir: join(AGENTIC_DIR, t.dir),
    title: t.title,
    prompt: t.prompt ?? DEFAULT_PROMPT,
  }));
}

/**
 * Extract code from a model response: last fenced block, else a plausible
 * bare-code fallback. Returns null when nothing usable is found.
 */
export function extractCode(response: string): string | null {
  const fence = /\`\`\`(?:js|javascript)?\s*\n([\s\S]*?)\n\`\`\`/g;
  const matches = [...response.matchAll(fence)];
  if (matches.length) return matches[matches.length - 1][1].trim();
  const trimmed = response.trim();
  if (/export\s+(function|const|async)|^function\s/.test(trimmed)) return trimmed;
  return null;
}

function runTests(dir: string): { ok: boolean; output: string } {
  try {
    const output = execFileSync(process.execPath, ['--test', 'test.js'], {
      cwd: dir,
      timeout: 30_000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, output };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; status?: number; message?: string };
    const output = (e.stdout ?? '') + (e.stderr ?? '');
    return { ok: false, output: output || String(e.message ?? error) };
  }
}

function buildPrompt(task: AgenticTask, src: string, iteration: number, lastTestOutput?: string): string {
  const lines: string[] = [];
  if (iteration === 0) {
    lines.push(task.prompt);
  } else {
    lines.push('Your previous fix still fails the tests. Test output:');
    lines.push(lastTestOutput?.slice(0, 1500) ?? '(no output)');
    lines.push('');
  }
  lines.push('');
  lines.push('Current src.js:');
  lines.push(src);
  lines.push('');
  lines.push('Respond with ONLY the complete fixed content of src.js inside a single \`\`\`js code fence.');
  lines.push('No explanation before or after the fence.');
  return lines.join('\n');
}

async function runTask(
  task: AgenticTask,
  provider: LLMProvider,
  model: string,
  mode: string,
  systemPrompt: string | undefined,
  maxIterations: number,
): Promise<AgenticResult> {
  const workdir = mkdtempSync(join(tmpdir(), `agentic-${task.id}-`));
  const started = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let lastOutput = '';
  try {
    cpSync(task.dir, workdir, { recursive: true });
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const src = readFileSync(join(workdir, 'src.js'), 'utf8');
      const prompt = buildPrompt(task, src, iteration, lastOutput);
      let result: CompletionResult;
      try {
        result = await provider.complete({
          model,
          system: mode === 'signal-coding' ? systemPrompt : undefined,
          prompt,
          temperature: 0,
        });
      } catch (error) {
        return {
          id: task.id,
          mode,
          success: false,
          iterations: iteration + 1,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          latency_ms: Date.now() - started,
          test_tail: '',
          error: error instanceof Error ? error.message : String(error),
        };
      }
      inputTokens += result.usage.input_tokens;
      outputTokens += result.usage.output_tokens;
      const code = extractCode(result.text);
      if (!code) {
        return {
          id: task.id,
          mode,
          success: false,
          iterations: iteration + 1,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          latency_ms: Date.now() - started,
          test_tail: '',
          error: 'no code extracted from model response',
        };
      }
      writeFileSync(join(workdir, 'src.js'), code + '\n');
      const test = runTests(workdir);
      lastOutput = test.output;
      if (test.ok) {
        return {
          id: task.id,
          mode,
          success: true,
          iterations: iteration + 1,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          latency_ms: Date.now() - started,
          test_tail: test.output.slice(0, 300),
        };
      }
    }
    return {
      id: task.id,
      mode,
      success: false,
      iterations: maxIterations,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: Date.now() - started,
      test_tail: lastOutput.slice(0, 300),
      error: 'tests still failing after max iterations',
    };
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

function renderReport(model: string, results: AgenticResult[]): string {
  const lines: string[] = [];
  lines.push('# Agentic Benchmark Report', '');
  lines.push(`**Model:** ${model} · **Tasks:** ${new Set(results.map((r) => r.id)).size} · **Max iterations:** ${Math.max(...results.map((r) => r.iterations), 1)}`);
  lines.push('');
  lines.push('| Task | Mode | Success | Iterations | Output tokens |');
  lines.push('|---|---|:---:|---:|---:|');
  for (const r of results) {
    lines.push(`| ${r.id} | ${r.mode} | ${r.success ? 'PASS' : 'FAIL'} | ${r.iterations} | ${r.output_tokens} |`);
  }
  lines.push('');
  const byMode = new Map<string, AgenticResult[]>();
  for (const r of results) {
    const list = byMode.get(r.mode) ?? [];
    list.push(r);
    byMode.set(r.mode, list);
  }
  lines.push('## Summary', '');
  lines.push('| Mode | Success rate | Tasks succeeded | Total output tokens | Tokens per successful task | Mean iterations |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const [mode, list] of byMode) {
    const ok = list.filter((r) => r.success);
    const tokens = list.reduce((a, r) => a + r.output_tokens, 0);
    const per = ok.length ? Math.round(tokens / ok.length) : 'n/a';
    const iters = list.reduce((a, r) => a + r.iterations, 0) / list.length;
    lines.push(`| ${mode} | ${ok.length}/${list.length} | ${ok.length} | ${tokens} | ${per} | ${iters.toFixed(1)} |`);
  }
  lines.push('');
  lines.push("*Real task completion: tests pass/fail on the agent's edited file — no judge involved.*");
  lines.push('');
  return lines.join('\n');
}

function main(): void {
  loadEnvFile();
  const args = process.argv.slice(2);
  let taskId: string | undefined;
  let mode: string | undefined;
  let model: string | undefined;
  let maxIterations = 3;
  let mock = false;
  let out: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--task') taskId = args[++i];
    if (args[i] === '--mode') mode = args[++i];
    if (args[i] === '--model') model = args[++i];
    if (args[i] === '--max-iterations') maxIterations = Number(args[++i]);
    if (args[i] === '--out') out = args[++i];
    if (args[i] === '--mock') mock = true;
  }
  if (!model) model = process.env.LLM_MODEL ?? 'openai/gpt-4o-mini';
  const modes = mode === 'normal' || mode === 'signal-coding' ? [mode] : ['normal', 'signal-coding'];
  const tasks = loadTasks().filter((t) => !taskId || t.id === taskId);
  if (!tasks.length) {
    console.error(`No tasks matched '${taskId ?? 'all'}'`);
    process.exit(1);
  }
  const provider: LLMProvider = mock
    ? new MockProvider({ model, tokenizer: createCounter('approximate') })
    : new OpenAICompatProvider({
        baseUrl: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
        apiKey: process.env.LLM_API_KEY ?? '',
        model,
        timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 120000),
        maxRetries: Number(process.env.LLM_MAX_RETRIES ?? 2),
      });
  if (!mock && !process.env.LLM_API_KEY) {
    console.error('No LLM_API_KEY set. Export it or use --mock.');
    process.exit(1);
  }
  const signalDoc = parseSkillFile(join(REPO_ROOT, 'signal-coding', 'SKILL.md'));
  const systemPrompt = signalDoc.body;

  const results: AgenticResult[] = [];
  (async () => {
    for (const task of tasks) {
      for (const m of modes) {
        console.log(`\n=== ${task.id} [${m}] ===`);
        const result = await runTask(task, provider, model, m, m === 'signal-coding' ? systemPrompt : undefined, maxIterations);
        console.log(`  ${result.success ? 'PASS' : 'FAIL'} in ${result.iterations} iters (${result.output_tokens} out tok)${result.error ? ' — ' + result.error : ''}`);
        results.push(result);
      }
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outBase = out ?? join(REPO_ROOT, 'results', `agentic-${stamp}`);
    writeFileSync(`${outBase}.json`, JSON.stringify({ generated_at: stamp, model, results }, null, 2));
    const md = renderReport(model, results);
    writeFileSync(`${outBase}.md`, md);
    console.log('\n' + md);
    console.log(`\nWrote ${outBase}.json and ${outBase}.md`);
  })().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
