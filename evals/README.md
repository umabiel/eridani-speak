# Evaluation harness

Reproducible measurement of the token/quality trade-off between **normal**
output and **signal-coding** output for coding-agent tasks.

## Quickstart

```bash
npm install
npm run validate-fixtures   # fixtures parse and pass schema checks
npm test                    # unit tests for the harness itself
npm run eval -- --suite debugging --mock   # offline demo run
npm run eval -- --suite debugging          # real run (needs API key)
npm run compare -- results/<ts>.normal.json results/<ts>.signal-coding.json
```

The eval writes per-mode result JSON and a Markdown report into `results/`
(`results/` is gitignored; the report is the deliverable).

## Fixtures

`fixtures/*.jsonl` — one JSON object per line. Six categories:

| Category | Files | What it measures |
|---|---|---|
| explanation | 10 | compression without losing definitions |
| debugging | 10 | root cause, evidence, fix, risk preserved |
| code-review | 10 | findings, severity, file/line precision |
| architecture | 10 | assumptions, constraints, trade-offs, decision criteria |
| planning | 10 | required steps, order, dependencies, risks |
| agentic | 5 | task success criteria on small coding tasks |

Each fixture declares:

- `expected_facts` — must survive compression (scored by presence in the response)
- `forbidden_loss` — constraints/nuances that must not be lost (uncertainty, trade-offs, conditions)
- optional `required_terms`, `required_conditions`, `task_success_criteria`

Schema: `schemas/eval.schema.json`.

## Metrics

- Raw: `input_tokens`, `output_tokens`, `total_tokens`, optional
  `cached_input_tokens` and `reasoning_tokens` when the provider reports them, `latency_ms`.
- Quality (deterministic, no LLM judge): `quality_score` (weighted presence of
  facts/constraints/terms/conditions), `critical_fact_recall`, `constraint_recall`,
  `task_success`.
- Derived: `compression_ratio`, `token_savings`, `context_savings`,
  `utility_per_token`, `tasks_per_million_tokens`.
- Conversation projection: measured per-turn token averages projected over
  simulated sessions of 5/10/20/40 turns to estimate cumulative context growth.

## Providers

OpenAI-compatible chat completions: works with OpenAI, OpenRouter, and local
servers (llama.cpp, LM Studio, Ollama /v1, vLLM).

```bash
cp .env.example .env   # set LLM_API_KEY (and LLM_BASE_URL/LLM_MODEL for local)
npm run eval -- --suite all --model gpt-4o-mini
```

`--mock` runs a deterministic offline provider (no API key, no network) for
tests, demos, and CI.

## CLI

```bash
npm run eval -- [--suite <category|all>] [--mode normal|signal-coding] [--model M] [--max-cases N] [--mock] [--temperature T] [--out PATH] [--judge]
npm run compare -- <normal.json> <signal.json>
npm run report            # renders latest results/ pair
npm run judge -- <normal.json> <signal.json> [--model M] [--max-cases N] [--mock]
```

## LLM judge

`npm run judge` scores every response on a 0-5 rubric (correctness,
completeness, constraints/uncertainty/trade-offs preserved, actionability,
unnecessary verbosity) with a blind, per-response LLM evaluation — no A/B
comparison, so longer answers get no bias. The judge prompt is in
scripts/judge.ts; it asks for strict JSON and the parser tolerates fences.

- Judge model: `LLM_JUDGE_MODEL` env (defaults to `LLM_MODEL`).
- Attach to a run directly: `npm run eval -- --suite all --judge`.
- Post-hoc: `npm run judge -- results/<ts>.normal.json results/<ts>.signal-coding.json`
  writes `<base>.judged.{normal,signal-coding}.json` + `<base>.judged.report.md`.
- Deterministic metrics and the judge are complementary: the deterministic
  scorer is a recall floor; the judge adds semantic quality signal.
- Same caveats as any LLM judge: model-dependent, cheap but not free, and
  rubric drift is possible — keep the model constant within a comparison.
