<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/ringed-planet_1fa90.png" width="120" />
</p>

<h1 align="center">eridani-speak</h1>

<p align="center">
  <strong>output-density skills for LLMs and coding agents. zero filler. measured, not promised.</strong>
</p>

<p align="center">
  <a href="#skills">Skills</a> •
  <a href="#signal-coding">Signal Coding</a> •
  <a href="#before--after">Before / After</a> •
  <a href="#install">Install</a> •
  <a href="#evaluation-harness">Evaluation</a> •
  <a href="#credits">Credits</a>
</p>

---

LLM output is verbose. Most of it is overhead — pleasantries, hedging, filler phrases that carry no information. You pay for every token.

This repo contains three skill files that fix that, each in a different way. All are inspired by Rocky — the Eridian character in Andy Weir's *Project Hail Mary*: a being that communicates at 6x human density. No filler. No grammar overhead. Pure signal.

## What this is (and is not)

**This is an output-density policy, not a token-compression library.**

- Signal does not change model tokenization. The tokenizer is untouched.
- Signal reduces *generated verbosity*: shorter, denser responses.
- Shorter outputs mean the conversation history grows more slowly, so later prompts are smaller and context pressure rises more slowly.
- Whether that trade-off is worth it depends on quality — which is why this repo ships an evaluation harness (see Evaluation below).

Claims in this README distinguish **examples** from **measured results**. No percentage is presented as a universal truth.

## Skills

### Signal — pure compression, no character

Rocky's early notation as a clean system for technical output. Same density, no personality. Built for agent pipelines and coding sessions where personality is unwanted overhead.

Notation fingerprint:

    X = Y           definition
    X → Y           causes / leads to
    X: a, b, c      properties
    Fix: ...        solution
    Note: ...       important caveat

**[→ signal/SKILL.md](signal/SKILL.md)**

### Rocky — Signal plus soul

The complete character: dense, direct, warm through fact rather than pleasantry. Nine linguistic patterns extracted from the book. No character names in the prompt. No book references. Pure linguistic pattern.

**[→ rocky/SKILL.md](rocky/SKILL.md)**

### Signal Coding — density for coding agents

A dedicated mode for Claude Code, Codex, Cursor, Cline, OpenCode, Windsurf, and other coding agents. Built for debugging, code review, architecture, planning, and implementation summaries.

Its guiding rule:

    Optimize for information density, not minimum word count.

Unlike plain Signal, it explicitly separates what may be compressed (verbosity) from what must survive (facts, assumptions, uncertainty, constraints, trade-offs, evidence, failure modes, structured technical data). It never sacrifices information merely to be shorter.

**[→ signal-coding/SKILL.md](signal-coding/SKILL.md)**

## Signal Coding

Activate with **#signalcodingon**, disable with **#signalcodingoff**.

**Compresses:** pleasantries, restating the question, generic intros, redundant conclusions, narrative transitions, filler hedging, meta-commentary, trivial-step explanations, obvious disclaimers.

**Preserves:** facts and evidence; assumptions and uncertainty — marked as such; constraints ("unless", "provided that", "if X exceeds Y"); trade-offs and decision criteria; failure modes and risks; alternatives; impact and next actions; commands, code, paths, symbols, line numbers; APIs, endpoints, versions, IDs, quantitative values, performance data, test results; error messages, stack traces; conditions attached to recommendations.

**Protected zones (never altered):** code blocks, inline code, diffs, patches, regex, URLs, file paths, CLI commands, version numbers, error messages, stack traces, technical identifiers, JSON, YAML, XML, SQL, tool parameters, machine-readable output. If a tool expects a structured format, the format wins.

**Non-negotiable rules:** never delete a condition to shorten; a trade-off states both sides;
uncertainty is marked, not dropped; plans keep risks and a done-when condition; numbers,
thresholds, and versions are never dropped.

Dense markers: `assume:` `unless:` `if:` `trade-off:` `?` `revisit when:`

Preferred shapes (use only the relevant sections):

    Finding:
    Cause:
    Evidence:
    Fix:
    Risk:
    Next:

    Decision:
    Why:
    Trade-off:
    Revisit when:

    File:
    Issue:
    Impact:
    Fix:
    Test:

## Before / After

### Normal LLM

**335 tokens**
> An LLM (Large Language Model) is a type of AI trained on massive amounts of text to predict and generate language.<br>
The core idea: given some text, what words are likely to come next? Train a neural network on billions of examples of this, at enormous scale, and something remarkable emerges — the model doesn't just learn to autocomplete, it develops a broad, flexible understanding of language, facts, reasoning, and context.<br>
A few key intuitions:<br>
It's a compression of human knowledge. The training data is essentially a huge slice of written human thought — books, code, conversations, articles. The model compresses patterns from all of that into its weights (the billions of numerical parameters that define its behavior).<br>
It works by predicting, not retrieving. It doesn't look things up in a database. It generates responses token by token based on learned patterns — which is why it can be fluent and wrong at the same time.<br>
"Large" is doing real work here. Scale turns out to matter enormously. Small language models are mediocre. Once you push past certain size thresholds (in data, parameters, and compute), capabilities emerge that weren't explicitly trained — reasoning, analogy, instruction-following, code generation.<br>
It's a base model, not a product. A raw LLM just predicts text. What makes it useful as an assistant is fine-tuning — a secondary training phase that teaches it to be helpful, follow instructions, and avoid harmful outputs. That's where something like Claude comes from.<br>
In short: an LLM is a very large statistical model of language that, through scale, ends up being surprisingly good at thinking-adjacent tasks.

### Signal mode

**56 tokens**
> LLM = Large Language Model. Neural net trained on massive text corpus.
Training → predicts next token → learns grammar, facts, reasoning patterns.
Key properties: probabilistic, stateless, context-limited.
Input = prompt. Output = token sequence. No memory between calls.

### Rocky mode

**82 tokens**
> LLM = Large Language Model. Big big big neural network. Trained on text text text. Learns patterns. Predicts next word. Repeat repeat. Sounds smart. Humans find useful.
Inside: numbers. Many many numbers. Called weights. Weights store knowledge-shape. Not real understanding. Pattern-matching. Very very good pattern-matching.
You want more detail on specific part. Question?

### Signal Coding — debugging

**Normal**
> It looks like the refresh token implementation is accepting sessions that have already been revoked. The JWT signature itself is still valid, so the current validation logic succeeds, but the application does not appear to check the revocation state stored in the database.

**Signal Coding**
> Finding: revoked sessions can issue new access tokens.
Cause: refreshToken() validates JWT signature but not session.revokedAt.
Fix: check revocation state before issuing access token.
Test: add revoked-session refresh case.

*These are single-prompt examples, not benchmark results.*

## Install

**One command (Claude Code / any agent using vercel-labs/skills):**

    npx skills add SijuEC/eridani-speak        # upstream
    npx skills add umabiel/eridani-speak       # this fork

Install a single mode:

    npx skills add SijuEC/eridani-speak --skill signal
    npx skills add SijuEC/eridani-speak --skill rocky
    npx skills add SijuEC/eridani-speak --skill signal-coding

**Manual install (any agent):** paste the prompt from the relevant SKILL.md into your agent's rules file.

| Agent | File |
|-------|------|
| Claude Code | CLAUDE.md |
| Cursor | .cursor/rules/ |
| Windsurf | .windsurf/rules/ |
| Cline | .clinerules/ |
| Copilot | .github/copilot-instructions.md |
| Any other | your agent's system prompt or rules file |

Active from session start, every session.

## Signal vs Rocky vs Signal Coding

| | Signal | Rocky | Signal Coding |
|---|---|---|---|
| **Style** | Alien engineer notation | Alien engineer with personality | Dense technical communication |
| **Warmth** | None | Warmth through fact | None |
| **Best for** | Pipelines, coding, technical chat | Chat interfaces, pair programming | Coding agents: debugging, review, planning, architecture |
| **Compresses** | Verbosity | Verbosity | Verbosity — never information |
| **Preserves** | Definitions | Character voice | Facts, assumptions, uncertainty, constraints, trade-offs, evidence, structured data |
| **Trigger** | #signalon | #rockyon | #signalcodingon |

## Evaluation harness

Signal Coding's promise — *same quality, fewer tokens* — is a testable claim. The repo ships a minimal TypeScript harness to measure it:

    npm install
    npm run eval -- --suite debugging --mock    # offline demo (no API key)
    npm run eval -- --suite all --model gpt-4o-mini   # real run
    npm run compare -- results/<ts>.normal.json results/<ts>.signal-coding.json

It runs every fixture in normal mode and in signal-coding mode, records input/output/total tokens (provider-reported when available, otherwise approximate or tiktoken-compatible counting), scores quality with deterministic presence checks (facts, constraints, terms, conditions), projects conversation growth over simulated 5/10/20/40-turn sessions, and writes a Markdown report into results/.

Key metrics: compression_ratio, token_savings, context_savings, quality_score, critical_fact_recall, constraint_recall, utility_per_token, tasks_per_million_tokens. An optional LLM judge (OpenRouter-compatible, rubric-based, blind per-response) scores correctness, completeness, constraint/uncertainty/trade-off preservation, actionability, and verbosity — run with --judge or npm run judge.

**[→ evals/README.md](evals/README.md)**

Deliberately not included in v0.1: LLM judge, multi-provider matrix, real repo-execution agentic benchmarks. The harness stays small on purpose.

## Work in progress

- Rocky's voice is hard to pin down — close enough that readers recognise it, but not finished.
- Measured results exist (see docs/benchmarks). Three-model matrix (judged with a constant gpt-4o-mini judge, ~73% output-token savings in all cases):
  - gpt-4o-mini: floor ratio 0.873 — density costs ~13% quality
  - gpt-4o: floor ratio 0.905 — density costs ~10% quality
  - deepseek-v4-flash: floor ratio 1.036 — density is free (signal >= normal)
  Conclusion: whether density is free depends on model strength, not family.
  - Agentic benchmark v0.2 (real bug-fix tasks, gpt-4o-mini): normal 5/6 vs signal 4/6 — small sample, signal slightly worse on real task completion.
- The agentic fixtures grade the agent's *report text*, not real repository edits. Repo-execution agentic benchmarks are next.
- Conversation projections are simulations from measured per-turn averages, not full multi-turn runs.

## Credits

**Andy Weir and *Project Hail Mary*** — the source. Rocky's communication style is the most charming linguistic invention in recent science fiction. This project is a love letter to it.

**[caveman](https://github.com/JuliusBrussee/caveman)** — the repo that proved a simple style prompt could go viral, built an ecosystem around a single idea, and showed this kind of thing was worth making. The structure of this repo follows the trail caveman blazed.

**[caveman-micro](https://github.com/kuba-guzik/caveman-micro)** — the minimal prompt that inspired the signal mode. The compression technique is caveman-micro's. The fingerprint — the = and → notation, the labelled conclusions — is Rocky's.

## Sacred zones — never touched

Code blocks, inline code, URLs, file paths, CLI commands, version numbers, error messages, stack traces, technical names. In every mode. Always.

Facts are sacred.

---

*Two beings built a shared language across 40 light years using only math and signal.
You don't need pleasantries to be understood.*