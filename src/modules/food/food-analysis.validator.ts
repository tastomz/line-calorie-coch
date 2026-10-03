import {
  FOOD_QUANTITY_UNITS,
  FoodAnalysisResult,
  FoodQuantityUnit,
} from './food-analysis.types';

export class FoodAnalysisValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FoodAnalysisValidationError';
  }
}

function assertFiniteNonNegative(field: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new FoodAnalysisValidationError(
      `${field} must be a non-negative finite number`,
    );
  }
  return value;
}

function assertPositive(field: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new FoodAnalysisValidationError(`${field} must be greater than 0`);
  }
  return value;
}

/** Soft upper bounds to reject obviously absurd model output. */
const MAX_CALORIES = 10000;
const MAX_MACRO_G = 2000;

const ALLOWED_UNITS = new Set<string>(FOOD_QUANTITY_UNITS);

/**
 * Map common model synonyms / plurals / Thai labels → canonical unit.
 * Unknown values stay as-is and are rejected by ALLOWED_UNITS (not silently widened).
 */
const QUANTITY_UNIT_ALIASES: Readonly<Record<string, FoodQuantityUnit>> = {
  pieces: 'piece',
  pcs: 'piece',
  pc: 'piece',
  slice: 'piece',
  slices: 'piece',
  skewer: 'piece',
  skewers: 'piece',
  stick: 'piece',
  sticks: 'piece',
  ชิ้น: 'piece',
  อัน: 'piece',

  plates: 'plate',
  dish: 'plate',
  dishes: 'plate',
  จาน: 'plate',

  bites: 'bite',
  คำ: 'bite',

  servings: 'serving',
  portion: 'serving',
  portions: 'serving',
  scoop: 'serving',
  scoops: 'serving',
  serve: 'serving',
  // Mass/volume estimates that are not discrete countable units → serving.
  g: 'serving',
  gram: 'serving',
  grams: 'serving',
  kg: 'serving',
  ส่วน: 'serving',

  bowls: 'bowl',
  ชาม: 'bowl',
  ถ้วยใหญ่: 'bowl',

  cups: 'cup',
  glass: 'cup',
  glasses: 'cup',
  mug: 'cup',
  ml: 'cup',
  ถ้วย: 'cup',
  แก้ว: 'cup',

  items: 'item',
  pack: 'item',
  packs: 'item',
  box: 'item',
  boxes: 'item',
};

export function normalizeQuantityUnit(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return '';
  }
  if (ALLOWED_UNITS.has(trimmed)) {
    return trimmed;
  }
  return QUANTITY_UNIT_ALIASES[trimmed] ?? trimmed;
}

export function validateFoodAnalysisResult(raw: unknown): FoodAnalysisResult {
  if (!raw || typeof raw !== 'object') {
    throw new FoodAnalysisValidationError('AI response must be an object');
  }

  const data = raw as Record<string, unknown>;
  const foodName =
    typeof data.foodName === 'string' ? data.foodName.trim() : '';
  if (!foodName) {
    throw new FoodAnalysisValidationError('foodName is required');
  }

  const estimatedCalories = assertFiniteNonNegative(
    'estimatedCalories',
    data.estimatedCalories,
  );
  const proteinG = assertFiniteNonNegative('proteinG', data.proteinG);
  const carbsG = assertFiniteNonNegative('carbsG', data.carbsG);
  const fatG = assertFiniteNonNegative('fatG', data.fatG);
  const confidence = assertFiniteNonNegative('confidence', data.confidence);
  const estimatedQuantity = assertPositive(
    'estimatedQuantity',
    data.estimatedQuantity,
  );

  const quantityUnitInput =
    typeof data.quantityUnit === 'string' ? data.quantityUnit : '';
  const quantityUnitRaw = normalizeQuantityUnit(quantityUnitInput);
  if (!quantityUnitRaw || !ALLOWED_UNITS.has(quantityUnitRaw)) {
    const shown = quantityUnitInput.trim() || '(empty)';
    throw new FoodAnalysisValidationError(
      `quantityUnit "${shown}" must be one of: ${FOOD_QUANTITY_UNITS.join(', ')}`,
    );
  }

  if (estimatedCalories > MAX_CALORIES) {
    throw new FoodAnalysisValidationError(
      'estimatedCalories is unrealistically high',
    );
  }
  if (proteinG > MAX_MACRO_G || carbsG > MAX_MACRO_G || fatG > MAX_MACRO_G) {
    throw new FoodAnalysisValidationError(
      'macro grams are unrealistically high',
    );
  }
  if (confidence > 1) {
    throw new FoodAnalysisValidationError('confidence must be between 0 and 1');
  }

  if (!Array.isArray(data.assumptions)) {
    throw new FoodAnalysisValidationError('assumptions must be an array');
  }
  const assumptions = data.assumptions
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    foodName,
    estimatedCalories,
    proteinG,
    carbsG,
    fatG,
    confidence,
    assumptions,
    estimatedQuantity,
    quantityUnit: quantityUnitRaw as FoodQuantityUnit,
  };
}

export function parseFoodAnalysisJson(content: string): FoodAnalysisResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new FoodAnalysisValidationError('AI response is not valid JSON');
  }
  return validateFoodAnalysisResult(parsed);
}
