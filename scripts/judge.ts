import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadEnvFile } from './env.js';
import { OpenAICompatProvider, MockProvider, type LLMProvider } from './providers.js';
import { loadFixtures, type EvalFixture } from './fixtures.js';
import { loadResult, renderReport, type RunResultFile } from './report.js';

export interface JudgeScores {
  correctness: number | null;
  completeness: number | null;
  constraints_preserved: number | null;
  uncertainty_preserved: number | null;
  tradeoffs_preserved: number | null;
  actionability: number | null;
  unnecessary_verbosity: number | null;
}

/** Mean of the 0-5 dimensions normalized to 0-1; null when nothing parsed. */
export function judgeScoreMean(scores: JudgeScores): number | null {
  const values = Object.values(scores).filter((v): v is number => v !== null);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length / 5;
}

function clampScore(v: number): number {
  return Math.max(0, Math.min(5, Math.round(v)));
}

/**
 * Extract the rubric JSON from a judge response. Tolerates markdown fences
 * and surrounding prose; returns null when no parseable JSON is found.
 */
export function parseJudgeJson(text: string): JudgeScores | null {
  const cleaned = text.split('```').join('').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const num = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return clampScore(v);
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return clampScore(Number(v));
    return null;
  };
  const scores: JudgeScores = {
    correctness: num(obj.correctness),
    completeness: num(obj.completeness),
    constraints_preserved: num(obj.constraints_preserved),
    uncertainty_preserved: num(obj.uncertainty_preserved),
    tradeoffs_preserved: num(obj.tradeoffs_preserved),
    actionability: num(obj.actionability),
    unnecessary_verbosity: num(obj.unnecessary_verbosity),
  };
  // No dimension parsed => treat as unparsed.
  if (Object.values(scores).every((v) => v === null)) return null;
  return scores;
}

export function buildJudgePrompt(fixture: EvalFixture, response: string): string {
  return [
    'You are a rigorous evaluator of assistant responses to software-engineering tasks.',
    'Score the ASSISTANT response below. Never score style alone: a short, dense answer can be perfect.',
    '',
    'TASK:',
    fixture.prompt,
    '',
    'FACTS THE ANSWER SHOULD INCLUDE (if relevant):',
    fixture.expected_facts.length ? fixture.expected_facts.join('\n') : '(none listed)',
    '',
    'NUANCES THAT MUST NOT BE LOST (constraints, uncertainty, trade-offs):',
    fixture.forbidden_loss.length ? fixture.forbidden_loss.join('\n') : '(none listed)',
    '',
    'ASSISTANT RESPONSE:',
    response,
    '',
    'Score each dimension from 0 (terrible) to 5 (excellent), integers only.',
    '  correctness: technically correct?',
    '  completeness: covers the relevant facts?',
    '  constraints_preserved: keeps constraints and conditions?',
    '  uncertainty_preserved: keeps uncertainty and hedging that carries meaning?',
    '  tradeoffs_preserved: keeps trade-offs and decision criteria?',
    '  actionability: does it tell the user what to do next?',
    '  unnecessary_verbosity: 5 = minimal filler, 0 = very verbose',
    '',
    'Respond with ONLY a JSON object, no prose, no markdown fences:',
    '{"correctness":0,"completeness":0,"constraints_preserved":0,"uncertainty_preserved":0,"tradeoffs_preserved":0,"actionability":0,"unnecessary_verbosity":0}',
  ].join('\n');
}

export async function judgeCase(
  provider: LLMProvider,
  model: string,
  fixture: EvalFixture,
  response: string,
): Promise<{ scores: JudgeScores | null; raw: string }> {
  const result = await provider.complete({ model, prompt: buildJudgePrompt(fixture, response), temperature: 0 });
  return { scores: parseJudgeJson(result.text), raw: result.text };
}

/**
 * Judge every case of a run in place; returns the number of cases whose
 * judge scores parsed successfully.
 */
export async function judgeRun(
  provider: LLMProvider,
  model: string,
  run: RunResultFile,
  fixtures: Map<string, EvalFixture>,
): Promise<number> {
  let parsed = 0;
  for (const c of run.cases) {
    const fixture = fixtures.get(c.fixtureId);
    if (!fixture) continue;
    const { scores } = await judgeCase(provider, model, fixture, c.output);
    c.judge = scores;
    if (scores) parsed += 1;
    console.log(
      `  [judge] ${c.mode} ${c.fixtureId}: ${scores ? Object.values(scores).filter((v): v is number => v !== null).length : 0}/7 dims`,
    );
  }
  return parsed;
}

function makeProvider(model: string, mock: boolean): LLMProvider {
  if (mock) return new MockProvider({ model, tokenizer: { count: (t: string) => Math.ceil(t.length / 4) } });
  return new OpenAICompatProvider({
    baseUrl: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
    apiKey: process.env.LLM_API_KEY ?? '',
    model,
  });
}

function main(): void {
  loadEnvFile();
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith('--'));
  let model: string | undefined;
  let maxCases: number | undefined;
  let mock = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model') model = args[++i];
    if (args[i] === '--max-cases') maxCases = Number(args[++i]);
    if (args[i] === '--mock') mock = true;
  }
  if (files.length < 2) {
    console.error('Usage: npm run judge -- <normal.json> <signal.json> [--model M] [--max-cases N] [--mock]');
    process.exit(1);
  }
  const judgeModel = process.env.LLM_JUDGE_MODEL ?? model ?? process.env.LLM_MODEL ?? 'openai/gpt-4o-mini';
  const apiKey = process.env.LLM_API_KEY ?? '';
  if (!mock && !apiKey) {
    console.error('No LLM_API_KEY set. Export it (see .env.example) or use --mock.');
    process.exit(1);
  }
  const provider = makeProvider(judgeModel, mock);
  const fixtures = new Map(loadFixtures().map((f) => [f.id, f]));
  const normal = loadResult(files[0]);
  const signal = loadResult(files[1]);
  let target = normal.cases;
  if (maxCases !== undefined && maxCases > 0) target = target.slice(0, maxCases);
  const ids = new Set(target.map((c) => c.fixtureId));
  const slice = (run: RunResultFile): RunResultFile => ({
    ...run,
    n_cases: ids.size,
    cases: run.cases.filter((c) => ids.has(c.fixtureId)),
  });
  const nRun = slice(normal);
  const sRun = slice(signal);
  console.log(`Judging ${ids.size} cases x 2 modes with ${judgeModel}...`);
  judgeRun(provider, judgeModel, nRun, fixtures)
    .then(async (n) => {
      console.log(`normal parsed: ${n}`);
      const s = await judgeRun(provider, judgeModel, sRun, fixtures);
      console.log(`signal parsed: ${s}`);
      const base = files[1].replace(/\.signal-coding\.json$/, '');
      writeFileSync(`${base}.judged.normal.json`, JSON.stringify(nRun, null, 2));
      writeFileSync(`${base}.judged.signal-coding.json`, JSON.stringify(sRun, null, 2));
      const markdown = renderReport({ model: nRun.model, suite: nRun.suite, normal: nRun, signal: sRun });
      const mdFile = `${base}.judged.report.md`;
      writeFileSync(mdFile, markdown);
      console.log(`\nWrote ${mdFile}`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
