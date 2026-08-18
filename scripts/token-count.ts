import { encode } from 'gpt-tokenizer/encoding/o200k_base';

export interface TokenCounter {
  readonly name: string;
  count(text: string): number;
}

/** Heuristic counter: ~1 token per 4 chars, non-ASCII chars weighted more. */
export class ApproximateCounter implements TokenCounter {
  readonly name = 'approximate';

  count(text: string): number {
    if (!text) return 0;
    let units = 0;
    for (const ch of text) {
      units += ch.codePointAt(0)! > 0x7f ? 1.6 : 1;
    }
    return Math.max(1, Math.round(units / 4));
  }
}

/** tiktoken-compatible counter (o200k_base) via the pure-JS gpt-tokenizer. */
export class TiktokenCounter implements TokenCounter {
  readonly name = 'tiktoken';

  count(text: string): number {
    if (!text) return 0;
    return encode(text).length;
  }
}

export type TokenizerKind = 'approximate' | 'tiktoken';

export function createCounter(kind: TokenizerKind): TokenCounter {
  switch (kind) {
    case 'tiktoken':
      return new TiktokenCounter();
    case 'approximate':
    default:
      return new ApproximateCounter();
  }
}

export function isValidTokenizerKind(value: string): value is TokenizerKind {
  return value === 'approximate' || value === 'tiktoken';
}
