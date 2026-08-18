import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Aggregate, CaseResult } from './metrics.js';
import { compressionRatio, contextSavings, tasksPerMillionTokens, tokenSavings, utilityPerToken } from './metrics.js';
import type { SimPoint } from './conversation-sim.js';
import { contextGrowthRate } from './conversation-sim.js';
import type { JudgeScores } from './judge.js';
import { loadEnvFile } from './env.js';

const RESULTS_DIR = fileURLToPath(new URL('../results', import.meta.url));

export interface RunResultFile {
  generated_at: string;
  model: string;
  tokenizer: string;
  suite: string;
  mode: string;
  provider: string;
  n_cases: number;
  aggregate: Aggregate;
  conversation_sim: SimPoint[];
  cases: CaseResult[];
}

export function formatPct(value: number | null): string {
  if (value === null || Number.isNaN(value)) return 'n/a';
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDelta(value: number | null, suffix = '%'): string {
  if (value === null || Number.isNaN(value)) return 'n/a';
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(1)}${suffix}`;
}

export interface ReportInput {
  model: string;
  suite: string;
  normal?: RunResultFile;
  signal?: RunResultFile;
  single?: RunResultFile;
}

function delta(normal: number | null, signal: number | null): number | null {
  if (normal === null || signal === null || normal === 0) return null;
  return signal / normal - 1;
}

export function renderReport(input: ReportInput): string {
  const lines: string[] = [];
  const { model, suite } = input;
  const normal = input.normal;
  const signal = input.signal;
  const single = input.single;

  lines.push('# Evaluation Report', '');
  lines.push(`**Model:** ${model} · **Suite:** ${suite} · **Token counting:** ${(signal ?? normal ?? single)?.tokenizer ?? 'n/a'}`);
  const src = signal ?? normal ?? single;
  if (src) lines.push(`**Provider:** ${src.provider} · **Cases:** ${src.n_cases} · **Generated:** ${src.generated_at}`);
  lines.push('');

  if (normal && signal) {
    const n = normal.aggregate;
    const s = signal.aggregate;
    const ratio = compressionRatio(s.output_tokens, n.output_tokens);
    const savings = tokenSavings(s.output_tokens, n.output_tokens);
    const nContext = normal.conversation_sim[normal.conversation_sim.length - 1];
    const sContext = signal.conversation_sim[signal.conversation_sim.length - 1];
    const ctxSavings =
      nContext && sContext ? contextSavings(sContext.cumulative_total_tokens, nContext.cumulative_total_tokens) : null;

    lines.push('## Metrics', '');
    lines.push('| Metric | Normal | Signal Coding | Delta |');
    lines.push('|---|---:|---:|---:|');
    const rows: Array<[string, number | null, number | null, (v: number | null) => string]> = [
      ['Cases', n.n, s.n, (v) => (v === null ? 'n/a' : String(v))],
      ['Input tokens', n.input_tokens, s.input_tokens, (v) => (v === null ? 'n/a' : String(v))],
      ['Output tokens', n.output_tokens, s.output_tokens, (v) => (v === null ? 'n/a' : String(v))],
      ['Total tokens', n.total_tokens, s.total_tokens, (v) => (v === null ? 'n/a' : String(v))],
      ['Cached input tokens', n.cached_input_tokens, s.cached_input_tokens, (v) => (v === null ? 'n/a' : String(v))],
      ['Reasoning tokens', n.reasoning_tokens, s.reasoning_tokens, (v) => (v === null ? 'n/a' : String(v))],
      ['Quality score (0-1)', n.quality_score, s.quality_score, (v) => (v === null ? 'n/a' : v.toFixed(3))],
      ['Critical fact recall', n.critical_fact_recall, s.critical_fact_recall, (v) => (v === null ? 'n/a' : v.toFixed(3))],
      ['Constraint recall', n.constraint_recall, s.constraint_recall, (v) => (v === null ? 'n/a' : v.toFixed(3))],
      ['Task success rate', n.task_success_rate, s.task_success_rate, (v) => (v === null ? 'n/a' : formatPct(v))],
      ['Tasks per 1M tokens', tasksPerMillionTokens(n.tasks_succeeded, n.total_tokens), tasksPerMillionTokens(s.tasks_succeeded, s.total_tokens), (v) => (v === null ? 'n/a' : v.toFixed(1))],
      ['Utility per token (x1e6)', utilityPerToken(n.quality_score, n.total_tokens) * 1e6, utilityPerToken(s.quality_score, s.total_tokens) * 1e6, (v) => (v === null ? 'n/a' : v.toFixed(3))],
      ['Mean latency (ms)', n.mean_latency_ms, s.mean_latency_ms, (v) => (v === null ? 'n/a' : v.toFixed(1))],
      ['Compression ratio (output)', 1, ratio, (v) => (v === null ? 'n/a' : formatPct(v))],
      ['Output token savings', 0, savings, (v) => (v === null ? 'n/a' : formatDelta(v))],
      ['Context savings (40 turns)', 0, ctxSavings, (v) => (v === null ? 'n/a' : formatDelta(v))],
    ];
    for (const [label, nv, sv, fmt] of rows) {
      const d = delta(nv, sv);
      lines.push(`| ${label} | ${fmt(nv)} | ${fmt(sv)} | ${d === null ? 'n/a' : formatDelta(d)} |`);
    }
    const failedNormal = normal.cases.filter((c) => c.error).length;
    const failedSignal = signal.cases.filter((c) => c.error).length;
    if (failedNormal + failedSignal > 0) {
      lines.push(
        `\n**Failed cases:** normal ${failedNormal}, signal-coding ${failedSignal} (see run JSON for per-case errors).`,
      );
    }
    lines.push('');

    const normalCtxGrowth = contextGrowthRate(normal.conversation_sim);
    const signalCtxGrowth = contextGrowthRate(signal.conversation_sim);
    const sysPrompt = signal.aggregate.system_prompt_tokens / Math.max(1, signal.aggregate.n);
    lines.push('## Conversation growth projection (simulated)', '');
    lines.push(`System prompt: **${Math.round(sysPrompt)} tokens** (signal mode) — charged once per session, treated as cached after the first turn.`);
    lines.push('');
    lines.push(`Average tokens added per turn (excl. one-time system prompt): normal **${normalCtxGrowth.toFixed(1)}** vs signal **${signalCtxGrowth.toFixed(1)}** (${formatDelta(delta(normalCtxGrowth, signalCtxGrowth))}).`);
    lines.push('');
    lines.push('| Turns | Normal cumulative | Signal cumulative | Context savings |');
    lines.push('|---|---:|---:|---:|');
    for (let i = 0; i < normal.conversation_sim.length; i++) {
      const np = normal.conversation_sim[i];
      const sp = signal.conversation_sim[i];
      if (!np || !sp) continue;
      const saving = contextSavings(sp.cumulative_total_tokens, np.cumulative_total_tokens);
      lines.push(`| ${np.turns} | ${np.cumulative_total_tokens.toLocaleString()} | ${sp.cumulative_total_tokens.toLocaleString()} | ${formatDelta(saving)} |`);
    }
    lines.push('');
  } else if (single) {
    const a = single.aggregate;
    lines.push('## Metrics', '');
    lines.push(`| Metric | ${single.mode} |`);
    lines.push('|---:|---:|');
    const rows: Array<[string, string]> = [
      ['Cases', String(a.n)],
      ['Input tokens', String(a.input_tokens)],
      ['Output tokens', String(a.output_tokens)],
      ['Total tokens', String(a.total_tokens)],
      ['Quality score (0-1)', a.quality_score.toFixed(3)],
      ['Critical fact recall', a.critical_fact_recall.toFixed(3)],
      ['Constraint recall', a.constraint_recall.toFixed(3)],
      ['Task success rate', a.task_success_rate === null ? 'n/a' : formatPct(a.task_success_rate)],
      ['Mean latency (ms)', a.mean_latency_ms.toFixed(1)],
    ];
    for (const [label, value] of rows) lines.push(`| ${label} | ${value} |`);
    lines.push('');
  }

  const source = signal ?? normal ?? single;
  if (source && new Set(source.cases.map((c) => c.category)).size > 1) {
    const byCategory = new Map<string, CaseResult[]>();
    for (const c of source.cases) {
      const list = byCategory.get(c.category) ?? [];
      list.push(c);
      byCategory.set(c.category, list);
    }
    lines.push('## Per-category', '');
    lines.push('| Category | Cases | Output tokens | Quality | Critical fact recall |');
    lines.push('|---|---:|---:|---:|---:|');
    for (const [category, cases] of [...byCategory.entries()].sort()) {
      const out = cases.reduce((acc, c) => acc + c.output_tokens, 0);
      const quality = cases.reduce((acc, c) => acc + c.quality_score, 0) / cases.length;
      const cfr = cases.reduce((acc, c) => acc + c.critical_fact_recall, 0) / cases.length;
      lines.push(`| ${category} | ${cases.length} | ${out.toLocaleString()} | ${quality.toFixed(3)} | ${cfr.toFixed(3)} |`);
    }
    lines.push('');
  }

  if (normal && signal) {
    const judgeLines = renderJudgeSection(normal, signal);
    if (judgeLines.length) lines.push(...judgeLines);
  }

  lines.push('---', '');
  lines.push('*Generated by eridani-speak eval harness. Metrics: deterministic presence checks' + (normal && signal && hasJudge(normal, signal) ? ' + LLM judge rubric' : '') + '.*');
  lines.push('');
  return lines.join('\n');
}

const JUDGE_DIMENSIONS: Array<keyof JudgeScores> = [
  'correctness',
  'completeness',
  'constraints_preserved',
  'uncertainty_preserved',
  'tradeoffs_preserved',
  'actionability',
  'unnecessary_verbosity',
];

function hasJudge(normal: RunResultFile, signal: RunResultFile): boolean {
  return normal.cases.some((c) => c.judge) || signal.cases.some((c) => c.judge);
}

function judgeMean(run: RunResultFile, dimension: keyof JudgeScores): number | null {
  const values = run.cases
    .map((c) => c.judge?.[dimension])
    .filter((v): v is number => v !== null);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function renderJudgeSection(normal: RunResultFile, signal: RunResultFile): string[] {
  if (!hasJudge(normal, signal)) return [];
  const lines: string[] = [];
  lines.push('## LLM Judge (rubric 0-5, blind per-response)', '');
  lines.push('| Dimension | Normal | Signal Coding | Delta |');
  lines.push('|---|---:|---:|---:|');
  for (const dimension of JUDGE_DIMENSIONS) {
    const n = judgeMean(normal, dimension);
    const s = judgeMean(signal, dimension);
    const d = n !== null && s !== null && n !== 0 ? s / n - 1 : null;
    lines.push(
      `| ${dimension} | ${n === null ? 'n/a' : n.toFixed(2)} | ${s === null ? 'n/a' : s.toFixed(2)} | ${d === null ? 'n/a' : formatDelta(d)} |`,
    );
  }
  const nOverall = judgeOverall(normal);
  const sOverall = judgeOverall(signal);
  const dOverall = nOverall !== null && sOverall !== null && nOverall !== 0 ? sOverall / nOverall - 1 : null;
  lines.push(
    `| **Overall (0-1)** | ${nOverall === null ? 'n/a' : nOverall.toFixed(3)} | ${sOverall === null ? 'n/a' : sOverall.toFixed(3)} | ${dOverall === null ? 'n/a' : formatDelta(dOverall)} |`,
  );
  lines.push('');
  lines.push('*Judge model: ' + (process.env.LLM_JUDGE_MODEL ?? process.env.LLM_MODEL ?? 'n/a') + ' — mean of parsed dimensions; unparsed cases excluded.*');
  lines.push('');
  return lines;
}

function judgeOverall(run: RunResultFile): number | null {
  const means: number[] = [];
  for (const c of run.cases) {
    if (!c.judge) continue;
    const values = Object.values(c.judge).filter((v): v is number => v !== null);
    if (values.length) means.push(values.reduce((a, b) => a + b, 0) / values.length / 5);
  }
  if (!means.length) return null;
  return means.reduce((a, b) => a + b, 0) / means.length;
}

export function loadResult(path: string): RunResultFile {
  return JSON.parse(readFileSync(path, 'utf8')) as RunResultFile;
}

function pickLatestPair(): [string, string] | null {
  const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.json'));
  const pairs = new Map<string, string[]>();
  for (const file of files) {
    const match = file.match(/^(.*)\.(normal|signal-coding)\.json$/);
    if (!match || !match[1]) continue;
    const list = pairs.get(match[1]) ?? [];
    list.push(file);
    pairs.set(match[1], list);
  }
  let best: [string, string] | null = null;
  let bestTime = 0;
  for (const [prefix, list] of pairs) {
    if (list.length < 2) continue;
    const time = Math.max(...list.map((f) => statSync(join(RESULTS_DIR, f)).mtimeMs));
    if (time > bestTime) {
      bestTime = time;
      best = [join(RESULTS_DIR, `${prefix}.normal.json`), join(RESULTS_DIR, `${prefix}.signal-coding.json`)];
    }
  }
  return best;
}

function main(): void {
  loadEnvFile();
  const args = process.argv.slice(2);
  let normalPath: string | undefined;
  let signalPath: string | undefined;
  let singlePath: string | undefined;
  if (args.length >= 2) {
    [normalPath, signalPath] = args;
  } else if (args.length === 1) {
    singlePath = args[0];
  } else {
    const pair = pickLatestPair();
    if (!pair) {
      console.error('No result files found in results/. Pass result files or run `npm run eval` first.');
      process.exit(1);
    }
    [normalPath, signalPath] = pair;
  }

  let markdown: string;
  let base: string;
  if (normalPath && signalPath) {
    const normal = loadResult(normalPath);
    const signal = loadResult(signalPath);
    markdown = renderReport({ model: signal.model, suite: signal.suite, normal, signal });
    base = signalPath.replace(/\.signal-coding\.json$/, '');
  } else if (singlePath) {
    const single = loadResult(singlePath);
    markdown = renderReport({ model: single.model, suite: single.suite, single });
    base = singlePath.replace(/\.json$/, '');
  } else {
    process.exit(1);
  }

  const mdFile = `${base}.report.md`;
  writeFileSync(mdFile, markdown);
  console.log(markdown);
  console.log(`\nReport written to ${mdFile}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
