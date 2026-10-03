import { randomBytes } from 'crypto';

/** Free-PRO promo limits. Admins type the values; the server enforces these. */
export const PROMO_MIN_DAYS = 1;
export const PROMO_MAX_DAYS = 365;
export const PROMO_DEFAULT_DAYS = 30;
export const PROMO_MIN_REDEMPTIONS = 1;
export const PROMO_MAX_REDEMPTIONS = 1000;
export const PROMO_DEFAULT_REDEMPTIONS = 1;

function isIntInRange(value: unknown, min: number, max: number): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

export function isValidPromoDays(days: unknown): days is number {
  return isIntInRange(days, PROMO_MIN_DAYS, PROMO_MAX_DAYS);
}

export function isValidPromoMaxRedemptions(count: unknown): count is number {
  return isIntInRange(count, PROMO_MIN_REDEMPTIONS, PROMO_MAX_REDEMPTIONS);
}

/**
 * Validates admin input for a generated Free-PRO code. Missing values fall back
 * to the defaults (30 days, 1 redemption); anything else must be a whole number
 * in range — strings, decimals and out-of-range values are rejected, not coerced.
 */
export function parsePromoParams(input: {
  trialDays?: unknown;
  maxRedemptions?: unknown;
}): { trialDays: number; maxRedemptions: number } {
  const trialDays = input.trialDays ?? PROMO_DEFAULT_DAYS;
  if (!isValidPromoDays(trialDays)) {
    throw new Error(
      `trialDays must be a whole number from ${PROMO_MIN_DAYS} to ${PROMO_MAX_DAYS}`,
    );
  }
  const maxRedemptions = input.maxRedemptions ?? PROMO_DEFAULT_REDEMPTIONS;
  if (!isValidPromoMaxRedemptions(maxRedemptions)) {
    throw new Error(
      `maxRedemptions must be a whole number from ${PROMO_MIN_REDEMPTIONS} to ${PROMO_MAX_REDEMPTIONS}`,
    );
  }
  return { trialDays, maxRedemptions };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Cryptographically random code: TASTOM-XXXXXX */
export function generateTastomPromoCode(): string {
  const bytes = randomBytes(6);
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `TASTOM-${suffix}`;
}
