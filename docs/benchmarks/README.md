# Benchmarks

Measured results only — no example is presented as a benchmark.

Each file records: model, provider, suite, token counting method, raw
per-case results, deterministic metrics, conversation growth projection,
and (when present) LLM judge rubric scores. Raw JSON lives in results/
(gitignored); these reports are the committed evidence.

| File | Run |
|---|---|
| 2026-08-18-openai-gpt-4o-mini.md | v0.1 skill — 55 fixtures x 2 modes, OpenRouter, gpt-4o-mini, tiktoken, judged |
| 2026-08-18-openai-gpt-4o-mini-v1.1.md | v1.1 skill (nuance rules) — same config, judged |