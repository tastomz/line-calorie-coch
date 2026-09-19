import {
  ACTIVITY_MULTIPLIERS,
  ActivityLevel,
  BmrInput,
  Goal,
  MacroTargets,
  MIN_DAILY_CALORIES,
  NutritionProfileInput,
  NutritionTargets,
  PROTEIN_G_PER_KG,
  Sex,
} from './nutrition.types';

export class NutritionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NutritionValidationError';
  }
}

function assertPositive(field: string, value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new NutritionValidationError(`${field} must be greater than 0`);
  }
}

export function calculateBmr(input: BmrInput): number {
  assertPositive('weightKg', input.weightKg);
  assertPositive('heightCm', input.heightCm);
  assertPositive('age', input.age);

  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;

  if (input.sex === 'MALE') {
    return base + 5;
  }

  return base - 161;
}

export function calculateTdee(
  bmr: number,
  activityLevel: ActivityLevel,
): number {
  assertPositive('bmr', bmr);
  return bmr * ACTIVITY_MULTIPLIERS[activityLevel];
}

export function calculateCalorieTarget(
  tdee: number,
  goal: Goal,
  sex: Sex,
): number {
  assertPositive('tdee', tdee);

  let target: number;
  switch (goal) {
    case 'LOSE_WEIGHT':
      target = tdee - 500;
      break;
    case 'MAINTAIN_WEIGHT':
      target = tdee;
      break;
    case 'GAIN_WEIGHT':
      target = tdee + 300;
      break;
  }

  const floored = Math.max(target, MIN_DAILY_CALORIES[sex]);
  return Math.round(floored);
}

export function calculateProteinTarget(
  targetWeightKg: number,
  goal: Goal,
): number {
  assertPositive('targetWeightKg', targetWeightKg);
  return Math.round(targetWeightKg * PROTEIN_G_PER_KG[goal]);
}

export function calculateMacros(
  dailyCalories: number,
  proteinG: number,
): MacroTargets {
  assertPositive('dailyCalories', dailyCalories);
  assertPositive('proteinG', proteinG);

  const proteinCalories = proteinG * 4;
  const fatCalories = dailyCalories * 0.25;
  const carbCalories = Math.max(
    0,
    dailyCalories - proteinCalories - fatCalories,
  );

  return {
    dailyCalories: Math.max(0, Math.round(dailyCalories)),
    dailyProteinG: Math.max(0, Math.round(proteinG)),
    dailyFatG: Math.max(0, Math.round(fatCalories / 9)),
    dailyCarbsG: Math.max(0, Math.round(carbCalories / 4)),
  };
}

export function calculateNutritionTargets(
  input: NutritionProfileInput,
): NutritionTargets {
  assertPositive('age', input.age);
  assertPositive('heightCm', input.heightCm);
  assertPositive('currentWeightKg', input.currentWeightKg);
  assertPositive('targetWeightKg', input.targetWeightKg);

  const bmr = calculateBmr({
    sex: input.sex,
    weightKg: input.currentWeightKg,
    heightCm: input.heightCm,
    age: input.age,
  });
  const tdee = calculateTdee(bmr, input.activityLevel);
  const dailyCalories = calculateCalorieTarget(tdee, input.goal, input.sex);
  const dailyProteinG = calculateProteinTarget(
    input.targetWeightKg,
    input.goal,
  );
  const macros = calculateMacros(dailyCalories, dailyProteinG);

  return {
    bmr,
    tdee,
    ...macros,
  };
}
