/**
 * Which Stripe key is configured and whether it may be used.
 * Live keys (sk_live_… / rk_live_…) need an explicit STRIPE_LIVE_ENABLED=true so a key
 * pasted by mistake can never start charging real money.
 */
export type StripeKeyMode =
  'none' | 'test' | 'live' | 'live_blocked' | 'invalid';

export function stripeKeyMode(
  secret: string | undefined,
  liveEnabled: string | undefined,
): StripeKeyMode {
  const s = (secret ?? '').trim();
  if (!s) return 'none';
  // sk_ = full secret key, rk_ = restricted secret key (limited permissions).
  if (s.startsWith('sk_test_') || s.startsWith('rk_test_')) return 'test';
  if (s.startsWith('sk_live_') || s.startsWith('rk_live_')) {
    return (liveEnabled ?? '').trim().toLowerCase() === 'true'
      ? 'live'
      : 'live_blocked';
  }
  return 'invalid';
}

export function isUsableStripeKey(mode: StripeKeyMode): boolean {
  return mode === 'test' || mode === 'live';
}
