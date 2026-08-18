# Agentic Benchmark Report

**Model:** openai/gpt-4o-mini · **Tasks:** 6 · **Max iterations:** 3

| Task | Mode | Success | Iterations | Output tokens |
|---|---|:---:|---:|---:|
| counter-race | normal | PASS | 3 | 484 |
| counter-race | signal-coding | PASS | 3 | 410 |
| auth-bypass | normal | PASS | 1 | 73 |
| auth-bypass | signal-coding | PASS | 1 | 72 |
| dedupe | normal | PASS | 2 | 242 |
| dedupe | signal-coding | FAIL | 3 | 451 |
| validation | normal | PASS | 3 | 207 |
| validation | signal-coding | PASS | 3 | 205 |
| cache-stale | normal | FAIL | 3 | 279 |
| cache-stale | signal-coding | FAIL | 3 | 272 |
| query-limit | normal | PASS | 1 | 116 |
| query-limit | signal-coding | PASS | 1 | 112 |

## Summary

| Mode | Success rate | Tasks succeeded | Total output tokens | Tokens per successful task | Mean iterations |
|---|---:|---:|---:|---:|---:|
| normal | 5/6 | 5 | 1401 | 280 | 2.2 |
| signal-coding | 4/6 | 4 | 1522 | 381 | 2.3 |

*Real task completion: tests pass/fail on the agent's edited file — no judge involved.*
