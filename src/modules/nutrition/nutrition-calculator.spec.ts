import {
  calculateBmr,
  calculateCalorieTarget,
  calculateMacros,
  calculateNutritionTargets,
  calculateProteinTarget,
  calculateTdee,
  NutritionValidationError,
} from './nutrition-calculator';
import { ACTIVITY_MULTIPLIERS, MIN_DAILY_CALORIES } from './nutrition.types';

describe('nutrition-calculator', () => {
  describe('calculateBmr', () => {
    it('calculates Mifflin-St Jeor BMR for male', () => {
      // 10*70 + 6.25*175 - 5*30 + 5 = 1648.75
      expect(
        calculateBmr({
          sex: 'MALE',
          weightKg: 70,
          heightCm: 175,
          age: 30,
        }),
      ).toBe(1648.75);
    });

    it('calculates Mifflin-St Jeor BMR for female', () => {
      // 10*70 + 6.25*175 - 5*30 - 161 = 1482.75
      expect(
        calculateBmr({
          sex: 'FEMALE',
          weightKg: 70,
          heightCm: 175,
          age: 30,
        }),
      ).toBe(1482.75);
    });
  });

  describe('calculateTdee', () => {
    const bmr = 1648.75;

    it.each([
      ['SEDENTARY', ACTIVITY_MULTIPLIERS.SEDENTARY],
      ['LIGHT', ACTIVITY_MULTIPLIERS.LIGHT],
      ['MODERATE', ACTIVITY_MULTIPLIERS.MODERATE],
      ['ACTIVE', ACTIVITY_MULTIPLIERS.ACTIVE],
      ['VERY_ACTIVE', ACTIVITY_MULTIPLIERS.VERY_ACTIVE],
    ] as const)('applies %s multiplier', (level, multiplier) => {
      expect(calculateTdee(bmr, level)).toBe(bmr * multiplier);
    });
  });

  describe('calculateCalorieTarget', () => {
    const tdee = 2500;

    it('subtracts 500 for LOSE_WEIGHT', () => {
      expect(calculateCalorieTarget(tdee, 'LOSE_WEIGHT', 'MALE')).toBe(2000);
    });

    it('keeps TDEE for MAINTAIN_WEIGHT', () => {
      expect(calculateCalorieTarget(tdee, 'MAINTAIN_WEIGHT', 'MALE')).toBe(
        2500,
      );
    });

    it('adds 300 for GAIN_WEIGHT', () => {
      expect(calculateCalorieTarget(tdee, 'GAIN_WEIGHT', 'MALE')).toBe(2800);
    });

    it('applies lower-bound protection for very low calorie results', () => {
      // Female BMR ~926.5, sedentary TDEE ~1111.8, lose => ~611.8 → floor 1200
      const bmr = calculateBmr({
        sex: 'FEMALE',
        weightKg: 45,
        heightCm: 150,
        age: 60,
      });
      const tdeeLow = calculateTdee(bmr, 'SEDENTARY');
      const raw = tdeeLow - 500;

      expect(raw).toBeLessThan(MIN_DAILY_CALORIES.FEMALE);
      expect(calculateCalorieTarget(tdeeLow, 'LOSE_WEIGHT', 'FEMALE')).toBe(
        MIN_DAILY_CALORIES.FEMALE,
      );
    });
  });

  describe('calculateProteinTarget', () => {
    it('uses 1.8 g/kg for LOSE_WEIGHT', () => {
      expect(calculateProteinTarget(75, 'LOSE_WEIGHT')).toBe(135);
    });

    it('uses 1.6 g/kg for MAINTAIN_WEIGHT', () => {
      expect(calculateProteinTarget(75, 'MAINTAIN_WEIGHT')).toBe(120);
    });

    it('uses 1.8 g/kg for GAIN_WEIGHT', () => {
      expect(calculateProteinTarget(75, 'GAIN_WEIGHT')).toBe(135);
    });
  });

  describe('calculateMacros', () => {
    it('calculates protein/fat/carb grams deterministically', () => {
      // protein 135g → 540 kcal
      // fat = 25% of 2211 = 552.75 kcal → 61.416… → 61g
      // carb = (2211 - 540 - 552.75) / 4 = 279.5625 → 280g
      expect(calculateMacros(2211, 135)).toEqual({
        dailyCalories: 2211,
        dailyProteinG: 135,
        dailyFatG: 61,
        dailyCarbsG: 280,
      });
    });

    it('never returns negative macro values', () => {
      // Protein alone exceeds calories: 500g * 4 = 2000 > 1000
      const macros = calculateMacros(1000, 500);

      expect(macros.dailyProteinG).toBe(500);
      expect(macros.dailyFatG).toBe(28); // 250 / 9
      expect(macros.dailyCarbsG).toBe(0);
      expect(macros.dailyCarbsG).toBeGreaterThanOrEqual(0);
      expect(macros.dailyFatG).toBeGreaterThanOrEqual(0);
      expect(macros.dailyProteinG).toBeGreaterThanOrEqual(0);
    });
  });

  describe('edge cases', () => {
    it('rejects invalid age', () => {
      expect(() =>
        calculateBmr({ sex: 'MALE', weightKg: 70, heightCm: 175, age: 0 }),
      ).toThrow(NutritionValidationError);
      expect(() =>
        calculateBmr({ sex: 'MALE', weightKg: 70, heightCm: 175, age: -1 }),
      ).toThrow(/age must be greater than 0/);
    });

    it('rejects invalid weight', () => {
      expect(() =>
        calculateBmr({ sex: 'MALE', weightKg: 0, heightCm: 175, age: 30 }),
      ).toThrow(/weightKg must be greater than 0/);
      expect(() => calculateProteinTarget(-5, 'LOSE_WEIGHT')).toThrow(
        /targetWeightKg must be greater than 0/,
      );
    });

    it('rejects invalid height', () => {
      expect(() =>
        calculateBmr({ sex: 'FEMALE', weightKg: 60, heightCm: -10, age: 25 }),
      ).toThrow(/heightCm must be greater than 0/);
    });
  });

  describe('calculateNutritionTargets', () => {
    it('returns full deterministic targets for a known profile', () => {
      // Male 80kg / 175cm / 30y / MODERATE / LOSE / target 75kg
      // BMR = 1748.75
      // TDEE = 1748.75 * 1.55 = 2710.5625
      // calories = round(2710.5625 - 500) = 2211
      // protein = round(75 * 1.8) = 135
      const result = calculateNutritionTargets({
        sex: 'MALE',
        age: 30,
        heightCm: 175,
        currentWeightKg: 80,
        targetWeightKg: 75,
        activityLevel: 'MODERATE',
        goal: 'LOSE_WEIGHT',
      });

      expect(result.bmr).toBe(1748.75);
      expect(result.tdee).toBe(2710.5625);
      expect(result.dailyCalories).toBe(2211);
      expect(result.dailyProteinG).toBe(135);
      expect(result.dailyFatG).toBe(61);
      expect(result.dailyCarbsG).toBe(280);
    });
  });
});
