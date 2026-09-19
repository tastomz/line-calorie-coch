export type QuantityAdjustment =
  | { kind: 'all' }
  | { kind: 'half' }
  | { kind: 'absolute'; quantity: number }
  | { kind: 'fraction'; numerator: number; denominator: number }
  | { kind: 'ambiguous' }
  | { kind: 'composition' }
  | { kind: 'none' };

const COMPOSITION_PATTERNS = [
  /ไม่กิน/,
  /กินแต่/,
  /เอาแค่/,
  /เฉพาะ/,
  /without\s+/i,
  /only\s+/i,
  /no\s+rice/i,
  /no\s+bread/i,
];

const AMBIGUOUS_PATTERNS = [
  /นิดเดียว/,
  /นิดหน่อย/,
  /หน่อย/,
  /เล็กน้อย/,
  /ไม่เยอะ/,
  /ไม่มาก/,
  /a\s+bit/i,
  /a\s+little/i,
];

/**
 * Deterministic parser for Thai/English quantity adjustments.
 * Does not call AI.
 *
 * @param options.allowBareNumber When true (pending-food confirmation context),
 *   a lone number like "3" or "84.2" is treated as absolute quantity.
 *   When false, bare numbers are ignored (kind: 'none') so callers can
 *   ask for clarification instead of guessing weight vs quantity.
 */
export function parseQuantityAdjustment(
  text: string,
  options?: { allowBareNumber?: boolean },
): QuantityAdjustment {
  const allowBareNumber = options?.allowBareNumber ?? false;
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) {
    return { kind: 'none' };
  }

  if (
    /^(กิน)?หมด$/.test(normalized) ||
    normalized === 'กินทั้งหมด' ||
    normalized === 'ทั้งหมด' ||
    normalized === 'eat all' ||
    normalized === 'all'
  ) {
    return { kind: 'all' };
  }

  if (
    COMPOSITION_PATTERNS.some((pattern) => pattern.test(normalized)) &&
    !/\d+/.test(normalized) &&
    !/ครึ่ง/.test(normalized)
  ) {
    return { kind: 'composition' };
  }

  if (
    AMBIGUOUS_PATTERNS.some((pattern) => pattern.test(normalized)) &&
    !/\d+/.test(normalized) &&
    !/ครึ่ง/.test(normalized)
  ) {
    return { kind: 'ambiguous' };
  }

  if (/ครึ่ง/.test(normalized) || /\bhalf\b/i.test(normalized)) {
    return { kind: 'half' };
  }

  const fromMatch = normalized.match(
    /(?:กิน(?:ไป|แค่)?\s*)?(\d+(?:\.\d+)?)\s*(?:จาก|\/|of)\s*(\d+(?:\.\d+)?)/,
  );
  if (fromMatch) {
    return {
      kind: 'fraction',
      numerator: Number(fromMatch[1]),
      denominator: Number(fromMatch[2]),
    };
  }

  const absoluteMatch = normalized.match(
    /(?:กิน(?:ไป|แค่)?\s*)?(\d+(?:\.\d+)?)\s*(ชิ้น|คำ|จาน|ส่วน|ลูก|ชิ้นซูชิ|pieces?|bites?|plates?)?/,
  );
  if (
    absoluteMatch &&
    (/กิน/.test(normalized) ||
      /ชิ้น|คำ|จาน|ส่วน|piece|bite|plate/.test(normalized))
  ) {
    return { kind: 'absolute', quantity: Number(absoluteMatch[1]) };
  }

  // Bare number only in pending-food confirmation context.
  const bareNumber = normalized.match(/^(\d+(?:\.\d+)?)$/);
  if (bareNumber && allowBareNumber) {
    return { kind: 'absolute', quantity: Number(bareNumber[1]) };
  }

  if (COMPOSITION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { kind: 'composition' };
  }

  return { kind: 'none' };
}

export type NutritionValues = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export function applyProportionalNutrition(
  original: NutritionValues,
  ratio: number,
): NutritionValues {
  if (!Number.isFinite(ratio) || ratio < 0) {
    throw new Error('ratio must be a non-negative finite number');
  }
  const clamped = Math.min(ratio, 10);
  return {
    calories: round1(original.calories * clamped),
    proteinG: round1(original.proteinG * clamped),
    carbsG: round1(original.carbsG * clamped),
    fatG: round1(original.fatG * clamped),
  };
}

export function resolveConsumedQuantity(
  adjustment: QuantityAdjustment,
  originalQuantity: number,
): number | null {
  switch (adjustment.kind) {
    case 'all':
      return originalQuantity;
    case 'half':
      return originalQuantity / 2;
    case 'absolute':
      return adjustment.quantity;
    case 'fraction':
      if (adjustment.denominator <= 0) return null;
      return originalQuantity * (adjustment.numerator / adjustment.denominator);
    default:
      return null;
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function quantityUnitLabelTh(unit: string): string {
  switch (unit) {
    case 'piece':
      return 'ชิ้น';
    case 'plate':
      return 'จาน';
    case 'bite':
      return 'คำ';
    case 'bowl':
      return 'ชาม';
    case 'cup':
      return 'ถ้วย';
    case 'serving':
      return 'ส่วน';
    default:
      return 'หน่วย';
  }
}
