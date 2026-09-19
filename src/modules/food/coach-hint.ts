import { createHash } from 'crypto';

export const COACH_HINT_VALUES = [
  'today_summary',
  'history',
  'calories_consumed',
  'calories_remaining',
  'protein_consumed',
  'protein_remaining',
  'meal_recommendation',
] as const;

export type CoachHint = (typeof COACH_HINT_VALUES)[number];

const ALLOWED = new Set<string>(COACH_HINT_VALUES);

/**
 * Strict allowlist for coach routing hints.
 * Arbitrary / user-influenced strings must never become AI instructions.
 */
export function parseCoachHint(value: unknown): CoachHint | null {
  if (typeof value !== 'string') {
    return null;
  }
  return ALLOWED.has(value) ? (value as CoachHint) : null;
}

/** Optional stable key if raw LINE ids must appear in structured logs. */
export function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}
