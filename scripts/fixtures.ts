import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CATEGORIES = [
  'explanation',
  'debugging',
  'code-review',
  'architecture',
  'planning',
  'agentic',
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface EvalFixture {
  id: string;
  category: string;
  prompt: string;
  /** Facts that MUST survive compression (scored by presence in the response). */
  expected_facts: string[];
  /** Constraints/nuances that must not be lost (uncertainty, trade-offs, conditions). */
  forbidden_loss: string[];
  reference_answer?: string;
  required_terms?: string[];
  required_conditions?: string[];
  task_success_criteria?: string[];
}

export const FIXTURES_DIR = fileURLToPath(new URL('../evals/fixtures', import.meta.url));

export function fixtureFileFor(category: string): string {
  return join(FIXTURES_DIR, `${category}.jsonl`);
}

export function loadFixtures(category?: string): EvalFixture[] {
  const files = category
    ? [fixtureFileFor(category)]
    : readdirSync(FIXTURES_DIR)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => join(FIXTURES_DIR, f));
  const out: EvalFixture[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed) as EvalFixture);
      } catch (error) {
        throw new Error(`Invalid JSON in ${file}: ${trimmed.slice(0, 120)} — ${(error as Error).message}`);
      }
    }
  }
  return out;
}

export function validateFixture(fixture: unknown): string[] {
  const f = fixture as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof f.id !== 'string' || f.id.length === 0) errors.push('missing string field: id');
  if (typeof f.category !== 'string' || f.category.length === 0) errors.push('missing string field: category');
  if (typeof f.prompt !== 'string' || f.prompt.length === 0) errors.push('missing string field: prompt');
  for (const field of ['expected_facts', 'forbidden_loss'] as const) {
    if (!Array.isArray(f[field]) || (f[field] as unknown[]).some((x) => typeof x !== 'string')) {
      errors.push(`${field} must be a string[]`);
    }
  }
  for (const field of ['required_terms', 'required_conditions', 'task_success_criteria'] as const) {
    const value = f[field];
    if (value !== undefined && (!Array.isArray(value) || value.some((x) => typeof x !== 'string'))) {
      errors.push(`${field} must be a string[] when present`);
    }
  }
  if (f.reference_answer !== undefined && typeof f.reference_answer !== 'string') {
    errors.push('reference_answer must be a string when present');
  }
  return errors;
}

export function validateAllFixtures(): { fixtures: EvalFixture[]; errors: Map<string, string[]> } {
  const fixtures = loadFixtures();
  const errors = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const fixture of fixtures) {
    const errs = validateFixture(fixture);
    if (seen.has(fixture.id)) errs.push(`duplicate id: ${fixture.id}`);
    seen.add(fixture.id);
    if (errs.length) errors.set(fixture.id, errs);
  }
  return { fixtures, errors };
}
