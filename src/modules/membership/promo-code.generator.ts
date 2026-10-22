import { randomBytes } from 'crypto';

/** Free-PRO promo limits. Admins type the values; the server enforces these. */
export const PROMO_MIN_DAYS = 1;
export const PROMO_MAX_DAYS = 365;
export const PROMO_DEFAULT_DAYS = 30;
export const PROMO_MIN_REDEMPTIONS = 1;
export const PROMO_MAX_REDEMPTIONS = 1000;
export const PROMO_DEFAULT_REDEMPTIONS = 1;
export const PROMO_DEFAULT_PREFIX = 'TASTOM';
export const PROMO_PREFIX_MIN_LENGTH = 2;
export const PROMO_PREFIX_MAX_LENGTH = 12;
const PROMO_PREFIX_PATTERN = new RegExp(
  `^[A-Z0-9]{${PROMO_PREFIX_MIN_LENGTH},${PROMO_PREFIX_MAX_LENGTH}}$`,
);

/**
 * Normalizes an admin-typed code prefix (trim + uppercase). Missing/blank falls
 * back to TASTOM; anything else must be 2–12 letters or digits (no dash/space).
 */
export function parsePromoPrefix(input: unknown): string {
  if (input === undefined || input === null) return PROMO_DEFAULT_PREFIX;
  if (typeof input !== 'string') {
    throw new Error('prefix must be text');
  }
  const prefix = input.trim().toUpperCase();
  if (prefix === '') return PROMO_DEFAULT_PREFIX;
  if (!PROMO_PREFIX_PATTERN.test(prefix)) {
    throw new Error(
      `prefix must be ${PROMO_PREFIX_MIN_LENGTH}–${PROMO_PREFIX_MAX_LENGTH} letters A–Z or digits 0–9`,
    );
  }
  return prefix;
}

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
  prefix?: unknown;
}): { trialDays: number; maxRedemptions: number; prefix: string } {
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
  const prefix = parsePromoPrefix(input.prefix);
  return { trialDays, maxRedemptions, prefix };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Cryptographically random code: PREFIX-XXXXXX (default TASTOM-XXXXXX) */
export function generatePromoCode(prefix = PROMO_DEFAULT_PREFIX): string {
  const safePrefix = parsePromoPrefix(prefix);
  const bytes = randomBytes(6);
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `${safePrefix}-${suffix}`;
}

/** Back-compat alias: TASTOM-XXXXXX */
export function generateTastomPromoCode(): string {
  return generatePromoCode(PROMO_DEFAULT_PREFIX);
}
