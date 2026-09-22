/**
 * Simple in-memory rate limiter for membership/admin abuse surfaces.
 * Does NOT apply to Stripe webhooks.
 */
export type MembershipRateBucket =
  | 'promo_redeem'
  | 'membership_login'
  | 'link_consume'
  | 'checkout'
  | 'admin_login'
  | 'dev_tools';

const LIMITS: Record<MembershipRateBucket, { max: number; windowMs: number }> =
  {
    promo_redeem: { max: 10, windowMs: 60_000 },
    membership_login: { max: 20, windowMs: 60_000 },
    link_consume: { max: 20, windowMs: 60_000 },
    checkout: { max: 5, windowMs: 60_000 },
    admin_login: { max: 10, windowMs: 60_000 },
    dev_tools: { max: 60, windowMs: 60_000 },
  };

type WindowState = { count: number; windowStartMs: number };

export class MembershipRateLimiter {
  private readonly windows = new Map<string, WindowState>();

  tryConsume(key: string, bucket: MembershipRateBucket): boolean {
    const id = key || 'anonymous';
    const { max, windowMs } = LIMITS[bucket];
    const mapKey = `${bucket}:${id}`;
    const now = Date.now();
    const current = this.windows.get(mapKey);
    if (!current || now - current.windowStartMs >= windowMs) {
      this.windows.set(mapKey, { count: 1, windowStartMs: now });
      return true;
    }
    if (current.count >= max) return false;
    current.count += 1;
    return true;
  }

  reset(): void {
    this.windows.clear();
  }
}

export const membershipRateLimiter = new MembershipRateLimiter();
