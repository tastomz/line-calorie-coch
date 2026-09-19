/**
 * Edit-before-save parsers for pending food confirmation.
 * Deterministic only — no AI.
 */

export type FoodEditParse =
  | { kind: 'calorie_override'; calories: number }
  | { kind: 'composition'; instruction: string }
  | { kind: 'ambiguous' }
  | { kind: 'none' };

const COMPOSITION_HINTS = [
  /ไม่ใช่/,
  /เป็น(?!.*ชิ้น)/,
  /เปลี่ยนเป็น/,
  /จริงๆ.*(หมู|ไก่|เนื้อ|ปลา|กุ้ง)/,
  /without\s+/i,
  /instead\s+of/i,
  /actually\s+/i,
];

/**
 * Parse free-text edits while a pending analysis is active.
 * Quantity phrases are handled separately by parseQuantityAdjustment.
 */
export function parseFoodEdit(text: string): FoodEditParse {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return { kind: 'none' };
  }

  const calorieMatch = normalized.match(
    /(?:แคล(?:อรี่)?|kcal|cal)\s*(?:น่าจะ|ประมาณ|เป็น|=|:)?\s*(\d+(?:\.\d+)?)/i,
  );
  if (calorieMatch) {
    const calories = Number(calorieMatch[1]);
    if (Number.isFinite(calories) && calories > 0 && calories <= 5000) {
      return { kind: 'calorie_override', calories: Math.round(calories) };
    }
    return { kind: 'ambiguous' };
  }

  const reverseCalorie = normalized.match(
    /^(\d+(?:\.\d+)?)\s*(?:แคล(?:อรี่)?|kcal|cal)\b/i,
  );
  if (reverseCalorie) {
    const calories = Number(reverseCalorie[1]);
    if (Number.isFinite(calories) && calories > 0 && calories <= 5000) {
      return { kind: 'calorie_override', calories: Math.round(calories) };
    }
  }

  if (COMPOSITION_HINTS.some((p) => p.test(normalized))) {
    return { kind: 'composition', instruction: normalized };
  }

  if (/แก้|แก้ไข|ผิด|ไม่ถูก/.test(normalized) && !/\d/.test(normalized)) {
    return { kind: 'ambiguous' };
  }

  return { kind: 'none' };
}
