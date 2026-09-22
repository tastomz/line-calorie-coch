import { randomBytes } from 'crypto';

/** Allowed promo trial durations (days). No arbitrary lengths. */
export const PROMO_ALLOWED_DAYS = [10, 15, 30] as const;
export type PromoAllowedDays = (typeof PROMO_ALLOWED_DAYS)[number];

export function isAllowedPromoDays(days: number): days is PromoAllowedDays {
  return (PROMO_ALLOWED_DAYS as readonly number[]).includes(days);
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
