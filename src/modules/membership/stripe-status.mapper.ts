/**
 * Stripe status → internal SubscriptionStatus mapper.
 * Never blindly assign raw provider strings.
 */

import { SubscriptionStatus } from '@prisma/client';

export function mapStripeSubscriptionStatus(
  stripeStatus: string | null | undefined,
): SubscriptionStatus {
  switch ((stripeStatus ?? '').toLowerCase()) {
    case 'active':
      return SubscriptionStatus.ACTIVE;
    case 'trialing':
      return SubscriptionStatus.TRIALING;
    case 'canceled':
    case 'cancelled':
      return SubscriptionStatus.CANCELED;
    case 'past_due':
    case 'unpaid':
      return SubscriptionStatus.PAST_DUE;
    case 'incomplete_expired':
    case 'ended':
      return SubscriptionStatus.EXPIRED;
    case 'incomplete':
    case 'paused':
      return SubscriptionStatus.PAST_DUE;
    default:
      return SubscriptionStatus.EXPIRED;
  }
}
