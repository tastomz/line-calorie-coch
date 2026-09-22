import { calculateNutritionTargets } from '../nutrition/nutrition-calculator';
import { buildGoalConfirmationFlex } from './onboarding.flex';
import {
  buildConfirmationText,
  buildWeightDeltaLabel,
  formatDisplayWeight,
} from './onboarding.messages';

describe('onboarding goal confirmation presentation', () => {
  const baseInput = {
    sex: 'MALE' as const,
    age: 29,
    heightCm: 181,
    currentWeightKg: 85,
    targetWeightKg: 73,
    activityLevel: 'MODERATE' as const,
    goal: 'LOSE_WEIGHT' as const,
  };

  it('builds compact Thai fallback with exact target values', () => {
    const targets = calculateNutritionTargets(baseInput);
    const text = buildConfirmationText({
      currentWeightKg: 85,
      targetWeightKg: 73,
      goal: 'LOSE_WEIGHT',
      targets,
    });

    expect(text).toContain('🎯 เป้าหมายของคุณ');
    expect(text).toContain('85 kg → 73 kg');
    expect(text).toContain('ลด 12 kg');
    expect(text).toContain(
      `🔥 ${targets.dailyCalories.toLocaleString('en-US')} kcal/วัน`,
    );
    expect(text).toContain(
      `🥩 โปรตีน ${Math.round(targets.dailyProteinG).toLocaleString('en-US')} g/วัน`,
    );
    expect(text).toContain('เป้าหมาย: ลดน้ำหนัก');
    expect(text).not.toContain('Calories');
    expect(text).not.toContain('Protein');
    expect(text).not.toMatch(/^Carbs$/m);
  });

  it('handles maintain / gain / equal weight delta labels', () => {
    expect(buildWeightDeltaLabel(80, 80)).toBe('➖ คงที่');
    expect(buildWeightDeltaLabel(70, 75)).toBe('📈 เพิ่ม 5 kg');
    expect(buildWeightDeltaLabel(85.5, 80.2)).toBe('📉 ลด 5.3 kg');
  });

  it('preserves decimal weights in display', () => {
    expect(formatDisplayWeight(84.2)).toBe('84.2');
    expect(formatDisplayWeight(85)).toBe('85');
  });

  it('builds flex dashboard with same numbers as backend targets', () => {
    const targets = calculateNutritionTargets(baseInput);
    const flex = buildGoalConfirmationFlex({
      currentWeightKg: 85,
      targetWeightKg: 73,
      goal: 'LOSE_WEIGHT',
      targets,
    });
    const json = JSON.stringify(flex);
    expect(flex.type).toBe('flex');
    expect(json).toContain('85 kg');
    expect(json).toContain('73 kg');
    expect(json).toContain('ลด 12 kg');
    expect(json).toContain(targets.dailyCalories.toLocaleString('en-US'));
    expect(json).toContain('ยืนยัน');
    expect(json).toContain('แก้ไข');
    expect(json).toContain('✓ ใช้เป้าหมายนี้');
  });

  it('renders gain-weight goal without changing calorie math', () => {
    const input = {
      ...baseInput,
      goal: 'GAIN_WEIGHT' as const,
      currentWeightKg: 70,
      targetWeightKg: 78,
    };
    const targets = calculateNutritionTargets(input);
    const text = buildConfirmationText({
      currentWeightKg: 70,
      targetWeightKg: 78,
      goal: 'GAIN_WEIGHT',
      targets,
    });
    expect(text).toContain('📈 เพิ่ม 8 kg');
    expect(text).toContain('เป้าหมาย: เพิ่มน้ำหนัก');
    expect(text).toContain(
      String(targets.dailyCalories.toLocaleString('en-US')),
    );
  });

  it('renders maintain when current equals target', () => {
    const text = buildConfirmationText({
      currentWeightKg: 75,
      targetWeightKg: 75,
      goal: 'MAINTAIN_WEIGHT',
      targets: {
        dailyCalories: 2200,
        dailyProteinG: 120,
        dailyCarbsG: 250,
        dailyFatG: 60,
      },
    });
    expect(text).toContain('75 kg → 75 kg');
    expect(text).toContain('➖ คงที่');
    expect(text).toContain('2,200 kcal/วัน');
  });
});
