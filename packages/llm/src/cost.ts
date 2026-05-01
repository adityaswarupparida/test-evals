export type TokenStats = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-haiku-4-5-20251001": {
    input: 1.0 / 1_000_000,
    output: 5.0 / 1_000_000,
    cacheRead: 0.10 / 1_000_000,
    cacheWrite: 1.25 / 1_000_000,
  },
  "claude-sonnet-4-6": {
    input: 3.0 / 1_000_000,
    output: 15.0 / 1_000_000,
    cacheRead: 0.3 / 1_000_000,
    cacheWrite: 3.75 / 1_000_000,
  },
};

const DEFAULT_PRICING = PRICING["claude-haiku-4-5-20251001"]!;

export function computeCostUsd(stats: TokenStats, model: string): number {
  const pricing = PRICING[model] ?? DEFAULT_PRICING;
  const nonCachedInput = Math.max(0, stats.inputTokens - stats.cacheReadTokens);
  return (
    nonCachedInput * pricing.input +
    stats.outputTokens * pricing.output +
    stats.cacheReadTokens * pricing.cacheRead +
    stats.cacheWriteTokens * pricing.cacheWrite
  );
}

export function sumTokenStats(stats: TokenStats[]): TokenStats {
  return stats.reduce(
    (acc, s) => ({
      inputTokens: acc.inputTokens + s.inputTokens,
      outputTokens: acc.outputTokens + s.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + s.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens + s.cacheWriteTokens,
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  );
}
