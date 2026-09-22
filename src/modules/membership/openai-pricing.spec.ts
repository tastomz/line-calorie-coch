import { estimateTokenCost, OPENAI_MODEL_PRICING_USD } from './openai-pricing';

describe('openai-pricing', () => {
  it('prices known gpt-4o-mini tokens', () => {
    const est = estimateTokenCost('gpt-4o-mini', 1_000_000, 1_000_000, 35);
    expect(est.known).toBe(true);
    expect(est.inputCostUsd).toBeCloseTo(
      OPENAI_MODEL_PRICING_USD['gpt-4o-mini'].inputPer1MUsd,
    );
    expect(est.outputCostUsd).toBeCloseTo(
      OPENAI_MODEL_PRICING_USD['gpt-4o-mini'].outputPer1MUsd,
    );
    expect(est.totalCostThb).toBeCloseTo(est.totalCostUsd * 35);
  });

  it('marks unknown models as not known', () => {
    const est = estimateTokenCost('mystery-model', 100, 50, 35);
    expect(est.known).toBe(false);
    expect(est.totalCostUsd).toBe(0);
  });
});
