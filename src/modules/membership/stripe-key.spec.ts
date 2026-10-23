import { isUsableStripeKey, stripeKeyMode } from './stripe-key';

describe('stripeKeyMode', () => {
  it('accepts test keys', () => {
    expect(stripeKeyMode('sk_test_abc', undefined)).toBe('test');
  });
  it('blocks live keys unless STRIPE_LIVE_ENABLED=true', () => {
    expect(stripeKeyMode('sk_live_abc', undefined)).toBe('live_blocked');
    expect(stripeKeyMode('sk_live_abc', 'false')).toBe('live_blocked');
    expect(stripeKeyMode('sk_live_abc', 'TRUE')).toBe('live');
  });
  it('handles empty and odd keys', () => {
    expect(stripeKeyMode('', 'true')).toBe('none');
    expect(stripeKeyMode('pk_live_abc', 'true')).toBe('invalid');
    expect(isUsableStripeKey('live')).toBe(true);
    expect(isUsableStripeKey('live_blocked')).toBe(false);
  });
});
