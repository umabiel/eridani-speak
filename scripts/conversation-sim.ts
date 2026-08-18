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

/**
 * Deterministic projection of conversation growth from measured per-turn
 * token averages. Each turn adds (input + output) tokens to the context.
 */
export function simulateConversation(perTurn: TurnStats, turnCounts: number[]): SimPoint[] {
  return turnCounts.map((turns) => {
    const cumulative_input_tokens = perTurn.input_tokens * turns;
    const cumulative_output_tokens = perTurn.output_tokens * turns;
    const sizes: number[] = [];
    let context = 0;
    for (let i = 0; i < turns; i++) {
      context += perTurn.input_tokens + perTurn.output_tokens;
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

/** Average tokens added to context per turn across the longest session. */
export function contextGrowthRate(points: SimPoint[]): number {
  const last = points[points.length - 1];
  if (!last) return 0;
  return last.context_size_at_end / last.turns;
}
