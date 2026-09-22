/**
 * Central OpenAI model pricing (USD per 1M tokens).
 * Used only for admin estimated-cost dashboards — never billed to users here.
 */

export type ModelTokenPricing = {
  inputPer1MUsd: number;
  outputPer1MUsd: number;
};

/** Official list prices (USD / 1M tokens). Update in one place only. */
export const OPENAI_MODEL_PRICING_USD: Record<string, ModelTokenPricing> = {
  'gpt-4o-mini': { inputPer1MUsd: 0.15, outputPer1MUsd: 0.6 },
  'gpt-4o': { inputPer1MUsd: 2.5, outputPer1MUsd: 10 },
  'gpt-4.1-mini': { inputPer1MUsd: 0.4, outputPer1MUsd: 1.6 },
  'gpt-4.1': { inputPer1MUsd: 2, outputPer1MUsd: 8 },
};

/** Fallback FX for display in THB (membership currency). Override via OPENAI_USD_THB_RATE. */
export const DEFAULT_USD_THB_RATE = 35;

export type TokenCostEstimate = {
  known: boolean;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  inputCostThb: number;
  outputCostThb: number;
  totalCostThb: number;
};

export function estimateTokenCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): {
  known: boolean;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
} {
  const pricing = OPENAI_MODEL_PRICING_USD[model];
  if (!pricing) {
    return {
      known: false,
      inputCostUsd: 0,
      outputCostUsd: 0,
      totalCostUsd: 0,
    };
  }
  const inputCostUsd = (inputTokens / 1_000_000) * pricing.inputPer1MUsd;
  const outputCostUsd = (outputTokens / 1_000_000) * pricing.outputPer1MUsd;
  return {
    known: true,
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd,
  };
}

export function toThb(usd: number, usdThbRate: number): number {
  return usd * usdThbRate;
}

export function estimateTokenCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  usdThbRate = DEFAULT_USD_THB_RATE,
): TokenCostEstimate {
  const base = estimateTokenCostUsd(model, inputTokens, outputTokens);
  return {
    known: base.known,
    inputCostUsd: base.inputCostUsd,
    outputCostUsd: base.outputCostUsd,
    totalCostUsd: base.totalCostUsd,
    inputCostThb: toThb(base.inputCostUsd, usdThbRate),
    outputCostThb: toThb(base.outputCostUsd, usdThbRate),
    totalCostThb: toThb(base.totalCostUsd, usdThbRate),
  };
}
