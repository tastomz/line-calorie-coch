import {
  parseExerciseCommand,
  parseHydrationCommand,
  parseRecoveryCommand,
  parseSleepCommand,
  parseStepsCommand,
} from '../health/health-commands';
import { isWeightDomainText } from '../weight/weight-parse';
import { detectCoachIntent } from './coach-intent';

export const FOOD_DAY_MAX_DAYS_AGO = 30;
export const FOOD_RANGE_DEFAULT_DAYS = 7;
export const FOOD_RANGE_MAX_DAYS = 14;

export type FoodDayCommand =
  | { kind: 'log_past'; daysAgo: 1; text: string }
  | { kind: 'view_day'; daysAgo: number }
  | { kind: 'view_range'; days: number };

/** Postback payload for tapping a day row in the range overview. */
export function foodDayCommandText(daysAgo: number): string {
  return `foodday:${daysAgo}`;
}

const POSTBACK_RE = /^foodday:(\d{1,2})$/;
const VIEW_YESTERDAY_RE =
  /^(?:ดู|สรุป)?เมื่อวาน(?:นี้)?(?:กินอะไร(?:ไป)?(?:บ้าง|แล้ว)?|เป็นไง|โอเคไหม)?$/;
const VIEW_DAY_BEFORE_RE =
  /^(?:ดู|สรุป)?เมื่อวานซืน(?:กินอะไร(?:ไป)?(?:บ้าง|แล้ว)?)?$/;
const VIEW_N_DAYS_AGO_RE = /^(?:ดู|สรุป)?(\d{1,2})วัน(?:ก่อน|ที่แล้ว)$/;
const VIEW_RANGE_RE = /^(?:ประวัติ|ดู)?ย้อนหลัง(?:(\d{1,2})(?:วัน)?)?$/;
const VIEW_RANGE_PAST_RE = /^(\d{1,2})วันที่ผ่านมา$/;
const LOG_YESTERDAY_RE = /^เมื่อวาน(?:นี้)?\s*(.+)$/;

function clampRange(n: number): FoodDayCommand {
  if (n <= 1) {
    return { kind: 'view_day', daysAgo: 1 };
  }
  return {
    kind: 'view_range',
    days: Math.min(n, FOOD_RANGE_MAX_DAYS),
  };
}

function isOtherDomainText(text: string): boolean {
  return (
    isWeightDomainText(text) ||
    detectCoachIntent(text) !== 'none' ||
    parseSleepCommand(text) !== null ||
    parseExerciseCommand(text) !== null ||
    parseStepsCommand(text) !== null ||
    parseHydrationCommand(text) !== null ||
    parseRecoveryCommand(text) !== null
  );
}

/**
 * Deterministic parser for past-day food commands. Returns null for anything
 * else so existing routing is untouched.
 */
export function parseFoodDayCommand(raw: string): FoodDayCommand | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }

  const postback = text.match(POSTBACK_RE);
  if (postback) {
    const daysAgo = Number(postback[1]);
    return daysAgo <= FOOD_DAY_MAX_DAYS_AGO
      ? { kind: 'view_day', daysAgo }
      : null;
  }

  const compact = text.replace(/\s+/g, '');

  if (VIEW_DAY_BEFORE_RE.test(compact)) {
    return { kind: 'view_day', daysAgo: 2 };
  }
  if (VIEW_YESTERDAY_RE.test(compact)) {
    return { kind: 'view_day', daysAgo: 1 };
  }

  const nAgo = compact.match(VIEW_N_DAYS_AGO_RE);
  if (nAgo) {
    const daysAgo = Number(nAgo[1]);
    return daysAgo >= 1 && daysAgo <= FOOD_DAY_MAX_DAYS_AGO
      ? { kind: 'view_day', daysAgo }
      : null;
  }

  const range = compact.match(VIEW_RANGE_RE);
  if (range) {
    return range[1]
      ? clampRange(Number(range[1]))
      : { kind: 'view_range', days: FOOD_RANGE_DEFAULT_DAYS };
  }
  const rangePast = compact.match(VIEW_RANGE_PAST_RE);
  if (rangePast) {
    return clampRange(Number(rangePast[1]));
  }

  // "เมื่อวานซืน…" with trailing text is not supported — leave it untouched.
  if (compact.startsWith('เมื่อวานซืน')) {
    return null;
  }

  const log = text.match(LOG_YESTERDAY_RE);
  if (log) {
    const food = log[1]
      .trim()
      .replace(/^(?:ได้)?(?:กิน|ทาน)\s*/, '')
      .trim();
    if (!food || isOtherDomainText(food)) {
      return null;
    }
    return { kind: 'log_past', daysAgo: 1, text: food };
  }

  return null;
}
