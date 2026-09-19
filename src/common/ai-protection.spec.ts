import { AiRateLimiter } from './ai-rate-limiter';
import { OpenAiCircuitBreaker } from './openai-circuit-breaker';

describe('AiRateLimiter', () => {
  it('limits per LINE user identity and bucket', () => {
    const limiter = new AiRateLimiter();
    for (let i = 0; i < 4; i++) {
      expect(limiter.tryConsume('U1', 'food_image')).toBe(true);
    }
    expect(limiter.tryConsume('U1', 'food_image')).toBe(false);
    // Different user is independent.
    expect(limiter.tryConsume('U2', 'food_image')).toBe(true);
    // Different bucket is independent.
    expect(limiter.tryConsume('U1', 'food_text')).toBe(true);
  });
});

describe('OpenAiCircuitBreaker', () => {
  it('opens after threshold failures and recovers after cooldown', () => {
    jest.useFakeTimers();
    const breaker = new OpenAiCircuitBreaker(3, 1000);
    expect(breaker.isOpen()).toBe(false);
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(false);
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(true);

    jest.advanceTimersByTime(1000);
    expect(breaker.isOpen()).toBe(false); // half-open probe allowed
    breaker.recordSuccess();
    expect(breaker.isOpen()).toBe(false);

    jest.useRealTimers();
  });
});
