import { FoodNutritionPatch } from './food-log.service';

/** Soft bounds aligned with food-analysis.validator. */
const MAX_CALORIES = 10000;
const MAX_MACRO_G = 2000;

export type ParsedNutritionEdit =
  | { ok: true; nutrition: FoodNutritionPatch }
  | { ok: false; reason: 'invalid' | 'out_of_bounds' };

/**
 * Parse manual nutrition edits. Zero AI.
 * Accepted forms:
 * - "kcal 650 protein 35 carbs 70 fat 20"
 * - "แคล 650 โปร 35 คาร์บ 70 ไขมัน 20"
 * - "650 35 70 20" (kcal P C F order)
 */
export function parseNutritionEdit(text: string): ParsedNutritionEdit {
  const raw = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!raw) {
    return { ok: false, reason: 'invalid' };
  }

  const labeled = {
    calories: matchNumber(
      raw,
      /(?:kcal|cal|แคล(?:อรี่)?|พลังงาน)\s*[:=]?\s*(\d+(?:\.\d+)?)/i,
    ),
    proteinG: matchNumber(
      raw,
      /(?:protein|โปร(?:ตีน)?|p)\s*[:=]?\s*(\d+(?:\.\d+)?)/i,
    ),
    carbsG: matchNumber(
      raw,
      /(?:carbs?|carb|คาร์บ(?:โบไฮเดรต)?|c)\s*[:=]?\s*(\d+(?:\.\d+)?)/i,
    ),
    fatG: matchNumber(raw, /(?:fat|ไขมัน|f)\s*[:=]?\s*(\d+(?:\.\d+)?)/i),
  };

  let nutrition: FoodNutritionPatch | null = null;
  if (
    labeled.calories != null &&
    labeled.proteinG != null &&
    labeled.carbsG != null &&
    labeled.fatG != null
  ) {
    nutrition = {
      calories: labeled.calories,
      proteinG: labeled.proteinG,
      carbsG: labeled.carbsG,
      fatG: labeled.fatG,
    };
  } else {
    const ordered = raw.match(
      /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/,
    );
    if (ordered) {
      nutrition = {
        calories: Number(ordered[1]),
        proteinG: Number(ordered[2]),
        carbsG: Number(ordered[3]),
        fatG: Number(ordered[4]),
      };
    }
  }

  if (!nutrition) {
    return { ok: false, reason: 'invalid' };
  }

  if (
    ![
      nutrition.calories,
      nutrition.proteinG,
      nutrition.carbsG,
      nutrition.fatG,
    ].every((n) => Number.isFinite(n) && n >= 0)
  ) {
    return { ok: false, reason: 'invalid' };
  }

  if (
    nutrition.calories > MAX_CALORIES ||
    nutrition.proteinG > MAX_MACRO_G ||
    nutrition.carbsG > MAX_MACRO_G ||
    nutrition.fatG > MAX_MACRO_G
  ) {
    return { ok: false, reason: 'out_of_bounds' };
  }

  return {
    ok: true,
    nutrition: {
      calories: round1(nutrition.calories),
      proteinG: round1(nutrition.proteinG),
      carbsG: round1(nutrition.carbsG),
      fatG: round1(nutrition.fatG),
    },
  };
}

function matchNumber(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
