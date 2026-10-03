import { FoodQuantityUnit } from '../food/food-analysis.types';
import { normalizeQuantityUnit } from '../food/food-analysis.validator';

/**
 * Lookup key: lowercase letters/digits/Thai marks only, so spacing, emoji and
 * punctuation never decide whether a dish matches.
 */
export function normalizeFoodKey(raw: string): string {
  return raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]/gu, '');
}

export type ServingRequest = {
  /** Dish text with the quantity phrase removed. */
  name: string;
  /** How many servings (default 1). */
  quantity: number;
  /** Unit the user named, or null when none was given. */
  unit: FoodQuantityUnit | null;
};

export const MAX_SERVING_QUANTITY = 10;

const UNIT_WORDS = 'จาน|ชาม|ถ้วย|แก้ว|ชิ้น|อัน|ส่วน';
const NUMBER_WORDS = '\\d+(?:\\.\\d+)?|ครึ่ง|หนึ่ง|สอง|สาม';

const TRAILING_QTY = new RegExp(
  `^(.+?)\\s*(${NUMBER_WORDS})\\s*(${UNIT_WORDS})$`,
);
const LEADING_QTY = new RegExp(
  `^(${NUMBER_WORDS})\\s*(${UNIT_WORDS})\\s*(.+)$`,
);
const LEADING_VERB = /^(?:ได้)?(?:กิน|ทาน|ขอ|เอา|สั่ง)\s*/;

const NUMBER_WORD_VALUES: Readonly<Record<string, number>> = {
  ครึ่ง: 0.5,
  หนึ่ง: 1,
  สอง: 2,
  สาม: 3,
};

function toQuantity(raw: string): number | null {
  const value = NUMBER_WORD_VALUES[raw] ?? Number(raw);
  return Number.isFinite(value) && value > 0 && value <= MAX_SERVING_QUANTITY
    ? value
    : null;
}

function toUnit(raw: string): FoodQuantityUnit | null {
  const unit = normalizeQuantityUnit(raw);
  switch (unit) {
    case 'piece':
    case 'plate':
    case 'bowl':
    case 'cup':
    case 'serving':
      return unit;
    default:
      return null;
  }
}

/**
 * Splits "ข้าวมันไก่ 2 จาน" / "ครึ่งจาน ส้มตำ" / "ข้าวมันไก่" into dish + amount.
 * Returns null when the amount is present but not understood — the caller must
 * then leave the message to the AI instead of guessing.
 */
export function parseServingRequest(text: string): ServingRequest | null {
  const trimmed = text.trim().replace(LEADING_VERB, '').trim();
  if (!trimmed) {
    return null;
  }

  const trailing = trimmed.match(TRAILING_QTY);
  if (trailing) {
    const quantity = toQuantity(trailing[2]);
    const unit = toUnit(trailing[3]);
    return quantity && unit ? { name: trailing[1], quantity, unit } : null;
  }

  const leading = trimmed.match(LEADING_QTY);
  if (leading) {
    const quantity = toQuantity(leading[1]);
    const unit = toUnit(leading[2]);
    return quantity && unit ? { name: leading[3], quantity, unit } : null;
  }

  // A bare number ("ข้าวมันไก่ 2") is ambiguous (see AMBIGUOUS_NUMBER) → AI.
  if (/\d/.test(trimmed)) {
    return null;
  }

  return { name: trimmed, quantity: 1, unit: null };
}
