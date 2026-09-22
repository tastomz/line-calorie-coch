import { SubscriptionStatus } from '@prisma/client';
import { mapStripeSubscriptionStatus } from './stripe-status.mapper';

describe('mapStripeSubscriptionStatus', () => {
  it('maps known Stripe statuses', () => {
    expect(mapStripeSubscriptionStatus('active')).toBe(
      SubscriptionStatus.ACTIVE,
    );
    expect(mapStripeSubscriptionStatus('trialing')).toBe(
      SubscriptionStatus.TRIALING,
    );
    expect(mapStripeSubscriptionStatus('canceled')).toBe(
      SubscriptionStatus.CANCELED,
    );
    expect(mapStripeSubscriptionStatus('past_due')).toBe(
      SubscriptionStatus.PAST_DUE,
    );
    expect(mapStripeSubscriptionStatus('incomplete_expired')).toBe(
      SubscriptionStatus.EXPIRED,
    );
  });

  it('does not blindly grant PRO for unknown strings', () => {
    expect(mapStripeSubscriptionStatus('weird')).toBe(
      SubscriptionStatus.EXPIRED,
    );
    expect(mapStripeSubscriptionStatus(undefined)).toBe(
      SubscriptionStatus.EXPIRED,
    );
  });
});
