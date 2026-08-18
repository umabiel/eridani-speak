import type { EvalFixture } from './fixtures.js';

export interface CaseResult {
  fixtureId: string;
  category: string;
  mode: string;
  output: string;
  input_tokens: number;
  /** Input tokens excluding the system prompt (prompt text only). */
  prompt_input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_input_tokens?: number;
  reasoning_tokens?: number;
  latency_ms: number;
  critical_fact_recall: number;
  constraint_recall: number;
  quality_score: number;
  task_success: boolean | null;
}

export interface Aggregate {
  n: number;
  input_tokens: number;
  prompt_input_tokens: number;
  /** System prompt tokens across all cases (signal mode only; 0 for normal). */
  system_prompt_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_input_tokens: number;
  reasoning_tokens: number;
  mean_latency_ms: number;
  quality_score: number;
  critical_fact_recall: number;
  constraint_recall: number;
  task_success_rate: number | null;
  tasks_succeeded: number;
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    // Replace punctuation with spaces so identifiers like refreshToken() and
    // session.revokedAt still match across phrasings. Code stays comparable
    // because both sides are normalized the same way.
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Deterministic substring presence check after normalization. */
export function contains(response: string, required: string): boolean {
  const needle = normalize(required);
  if (!needle) return true;
  return normalize(response).includes(needle);
}

export function recall(response: string, items: string[]): number {
  if (!items.length) return 1;
  const hits = items.filter((item) => contains(response, item)).length;
  return hits / items.length;
}

export interface QualityScore {
  quality_score: number;
  critical_fact_recall: number;
  constraint_recall: number;
  task_success: boolean | null;
}

/**
 * Deterministic quality scoring: presence of expected facts, constraints,
 * required terms and conditions. No LLM judge involved.
 */
export function scoreQuality(response: string, fixture: EvalFixture): QualityScore {
  const critical_fact_recall = recall(response, fixture.expected_facts);
  const constraint_recall = recall(response, fixture.forbidden_loss);
  const termRecall = fixture.required_terms?.length ? recall(response, fixture.required_terms) : 1;
  const conditionRecall = fixture.required_conditions?.length ? recall(response, fixture.required_conditions) : 1;
  const quality_score =
    critical_fact_recall * 0.5 + constraint_recall * 0.3 + termRecall * 0.1 + conditionRecall * 0.1;
  const criteria = fixture.task_success_criteria ?? [];
  const task_success = criteria.length ? criteria.every((c) => contains(response, c)) : null;
  return { quality_score, critical_fact_recall, constraint_recall, task_success };
}

export function aggregate(cases: CaseResult[]): Aggregate {
  const n = cases.length;
  const sum = (pick: (c: CaseResult) => number): number => cases.reduce((acc, c) => acc + pick(c), 0);
  const successGraded = cases.filter((c) => c.task_success !== null).length;
  const tasksSucceeded = cases.filter((c) => c.task_success === true).length;
  return {
    n,
    input_tokens: sum((c) => c.input_tokens),
    prompt_input_tokens: sum((c) => c.prompt_input_tokens),
    system_prompt_tokens: sum((c) => c.input_tokens - c.prompt_input_tokens),
    output_tokens: sum((c) => c.output_tokens),
    total_tokens: sum((c) => c.total_tokens),
    cached_input_tokens: sum((c) => c.cached_input_tokens ?? 0),
    reasoning_tokens: sum((c) => c.reasoning_tokens ?? 0),
    mean_latency_ms: n ? sum((c) => c.latency_ms) / n : 0,
    quality_score: n ? sum((c) => c.quality_score) / n : 0,
    critical_fact_recall: n ? sum((c) => c.critical_fact_recall) / n : 0,
    constraint_recall: n ? sum((c) => c.constraint_recall) / n : 0,
    task_success_rate: successGraded ? tasksSucceeded / successGraded : null,
    tasks_succeeded: tasksSucceeded,
  };
}

export function compressionRatio(signalTokens: number, normalTokens: number): number | null {
  if (!normalTokens || normalTokens <= 0) return null;
  return signalTokens / normalTokens;
}

export function tokenSavings(signalTokens: number, normalTokens: number): number | null {
  const ratio = compressionRatio(signalTokens, normalTokens);
  return ratio === null ? null : 1 - ratio;
}

export function contextSavings(signalCumulative: number, normalCumulative: number): number | null {
  return tokenSavings(signalCumulative, normalCumulative);
}

export function utilityPerToken(qualityScore: number, totalTokens: number): number {
  return totalTokens > 0 ? qualityScore / totalTokens : 0;
}

export function tasksPerMillionTokens(tasksSucceeded: number, totalTokens: number): number {
  return totalTokens > 0 ? (tasksSucceeded * 1_000_000) / totalTokens : 0;
}
