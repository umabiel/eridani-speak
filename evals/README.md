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
npm run eval -- [--suite <category|all>] [--mode normal|signal-coding] [--model M] [--max-cases N] [--mock] [--temperature T] [--out PATH]
npm run compare -- <normal.json> <signal.json>
npm run report            # renders latest results/ pair
```

## Honest limits

- Token counting is `approximate` (heuristic) or `tiktoken` (o200k_base via
  gpt-tokenizer). When the provider reports usage, provider numbers win.
- In signal-coding mode the system prompt is counted in per-case input tokens
  (it is sent with every request). In real use a cached system prompt
  amortizes to near zero after the first turn; the conversation projection
  currently counts it per turn, which *overstates* signal-mode context growth.
  Treat conversation savings as a conservative lower bound.
- Quality scoring is deterministic substring presence — a strong floor, not a
  full semantic judge. An LLM judge is planned but deliberately not required.
- The agentic fixtures grade the *report* text, not real repository edits.
  Real repo-execution agentic benchmarks are future work.
