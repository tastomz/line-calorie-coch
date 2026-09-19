export type Sex = 'MALE' | 'FEMALE';

export type Goal = 'LOSE_WEIGHT' | 'MAINTAIN_WEIGHT' | 'GAIN_WEIGHT';

export type ActivityLevel =
  'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE';

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
};

export const PROTEIN_G_PER_KG: Record<Goal, number> = {
  LOSE_WEIGHT: 1.8,
  MAINTAIN_WEIGHT: 1.6,
  GAIN_WEIGHT: 1.8,
};

/** Sensible V1 floors to avoid unsafe extreme deficits. */
export const MIN_DAILY_CALORIES: Record<Sex, number> = {
  FEMALE: 1200,
  MALE: 1500,
};

export const SEX_VALUES: readonly Sex[] = ['MALE', 'FEMALE'] as const;
export const GOAL_VALUES: readonly Goal[] = [
  'LOSE_WEIGHT',
  'MAINTAIN_WEIGHT',
  'GAIN_WEIGHT',
] as const;
export const ACTIVITY_LEVEL_VALUES: readonly ActivityLevel[] = [
  'SEDENTARY',
  'LIGHT',
  'MODERATE',
  'ACTIVE',
  'VERY_ACTIVE',
] as const;

export interface BmrInput {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
}

export interface MacroTargets {
  dailyCalories: number;
  dailyProteinG: number;
  dailyCarbsG: number;
  dailyFatG: number;
}

export interface NutritionTargets extends MacroTargets {
  bmr: number;
  tdee: number;
}

export interface NutritionProfileInput {
  sex: Sex;
  age: number;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
}
