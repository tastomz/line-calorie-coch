import {
  fastModel,
  reasoningEffortFor,
  REASONING_MODEL,
  smartModel,
} from './ai-models';
import { pricingFor } from '../modules/membership/openai-pricing';

describe('ai-models', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('defaults to GPT-6.1 Sol (smart) and GPT-6 Luna (fast)', () => {
    delete process.env.AI_MODEL_SMART;
    delete process.env.AI_MODEL_FAST;
    expect(smartModel()).toBe('gpt-6.1-sol');
    expect(fastModel()).toBe('gpt-6-luna');
  });

  it('can be switched back by env without a rebuild; rejects junk', () => {
    process.env.AI_MODEL_SMART = 'gpt-5';
    process.env.AI_MODEL_FAST = 'bad model; drop';
    expect(smartModel()).toBe('gpt-5');
    expect(fastModel()).toBe('gpt-6-luna');
  });

  it('treats gpt-5, gpt-6 and o-series as reasoning models', () => {
    for (const m of ['gpt-5', 'gpt-6.1-sol', 'gpt-6-luna', 'o4-mini']) {
      expect(REASONING_MODEL.test(m)).toBe(true);
    }
    expect(REASONING_MODEL.test('gpt-4o-mini')).toBe(false);
  });

  it.each([
    ['gpt-5', 'fast', 'minimal'],
    ['gpt-6-luna', 'fast', 'none'],
    ['gpt-6.1-sol', 'fast', 'low'], // Sol has no none/minimal
    ['gpt-6.1-sol', 'normal', 'low'],
    ['gpt-6-luna', 'normal', 'low'],
  ] as const)('%s at %s → %s', (model, speed, effort) => {
    expect(reasoningEffortFor(model, speed)).toBe(effort);
  });
});

describe('pricingFor', () => {
  it('prices exact ids and dated snapshots, not other variants', () => {
    expect(pricingFor('gpt-6.1-sol')?.inputPer1MUsd).toBe(2);
    expect(pricingFor('gpt-5-2025-08-07')?.outputPer1MUsd).toBe(10);
    expect(pricingFor('gpt-5-mini')).toBeUndefined();
  });
});
