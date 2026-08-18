# Agentic benchmark (v0.2)

Real task completion: the agent edits code and a test suite decides.
This is the §28 metric — successful tasks per 1M tokens — measured, not judged.

## Tasks

repos/<id>/ contains a tiny ESM project: src.js (with an injected bug) and
test.js (node:test suite that fails on the bug). The task manifest is
tasks.json. Bugs mirror the eval categories: race conditions, auth bypass,
double-charge dedupe, input validation, stale cache, N+1 lookups.

## Run

```bash
npm run agentic -- [--task <id|all>] [--mode normal|signal-coding|both] [--model M] [--max-iterations N] [--mock]
```

Each task x mode: copy repo to a temp dir -> model returns a full-file edit
-> write + run node --test -> on failure, feed test output back (up to
max-iterations, default 3). Results: results/agentic-<ts>.json + .md.

## Metrics

- task success (tests pass)
- tokens per successful task
- mean iterations

Signal-coding affects only the model prompt, never the code output — so
token savings here are about iteration efficiency, not output size.
