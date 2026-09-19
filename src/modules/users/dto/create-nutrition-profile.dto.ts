import { ActivityLevel, Goal, Sex } from '../../nutrition/nutrition.types';

export class CreateNutritionProfileDto {
  sex!: Sex;
  age!: number;
  heightCm!: number;
  currentWeightKg!: number;
  targetWeightKg!: number;
  activityLevel!: ActivityLevel;
  goal!: Goal;
}
