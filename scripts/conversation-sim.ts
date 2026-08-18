export interface TurnStats {
  input_tokens: number;
  output_tokens: number;
}

export interface SimPoint {
  turns: number;
  cumulative_input_tokens: number;
  cumulative_output_tokens: number;
  cumulative_total_tokens: number;
  context_size_at_end: number;
  context_sizes: number[];
}

export interface SimOptions {
  /**
   * One-time tokens added to the first turn only — e.g. a system prompt that
   * is cached after the first request. Defaults to 0.
   */
  initialTokens?: number;
}

/**
 * Deterministic projection of conversation growth from measured per-turn
 * token averages. Each turn adds (input + output) tokens to the context;
 * initialTokens (e.g. a cached system prompt) is added once, on turn 1.
 */
export function simulateConversation(
  perTurn: TurnStats,
  turnCounts: number[],
  options: SimOptions = {},
): SimPoint[] {
  const initialTokens = options.initialTokens ?? 0;
  return turnCounts.map((turns) => {
    const cumulative_input_tokens = perTurn.input_tokens * turns + initialTokens;
    const cumulative_output_tokens = perTurn.output_tokens * turns;
    const sizes: number[] = [];
    let context = 0;
    for (let i = 0; i < turns; i++) {
      context += (i === 0 ? initialTokens : 0) + perTurn.input_tokens + perTurn.output_tokens;
      sizes.push(context);
    }
    return {
      turns,
      cumulative_input_tokens,
      cumulative_output_tokens,
      cumulative_total_tokens: cumulative_input_tokens + cumulative_output_tokens,
      context_size_at_end: context,
      context_sizes: sizes,
    };
  });
}

/**
 * Marginal tokens added to context per turn: the slope between the first and
 * last simulation points. Using the slope naturally excludes any one-time
 * initial charge (e.g. a cached system prompt) from the per-turn rate.
 */
export function contextGrowthRate(points: SimPoint[]): number {
  const last = points[points.length - 1];
  const first = points[0];
  if (!last || !first || last.turns <= first.turns) return 0;
  return (last.context_size_at_end - first.context_size_at_end) / (last.turns - first.turns);
}
