import {
  buildDailyCoachSummaryMessage,
  buildDeterministicCoachTip,
  buildHistoryMessage,
  buildMealRecommendationFallback,
  NO_FOOD_LOGS_TODAY_TEXT,
} from './daily-coach.messages';
import { DailyCoachSummary } from './daily-summary.service';

const baseSummary = (): DailyCoachSummary => ({
  date: new Date(),
  consumed: { calories: 1250, proteinG: 82, carbsG: 120, fatG: 42 },
  target: { calories: 2000, proteinG: 140, carbsG: 220, fatG: 55 },
  remaining: { calories: 750, proteinG: 58, carbsG: 100, fatG: 13 },
});

describe('daily-coach.messages', () => {
  it('formats today summary with remaining values', () => {
    const text = buildDailyCoachSummaryMessage(baseSummary());
    expect(text).toContain('📊 วันนี้');
    expect(text).toContain('1,250 / 2,000 kcal');
    expect(text).toContain('เหลือ 750 kcal');
    expect(text).toContain('82 / 140g');
    expect(text).toContain('เหลือ 58 g');
  });

  it('formats history from FoodLog rows', () => {
    const text = buildHistoryMessage([
      {
        eatenAt: new Date('2026-09-19T01:30:00.000Z'), // 08:30 Bangkok
        foodName: 'ไข่ 2 ฟอง',
        calories: 140,
      },
      {
        eatenAt: new Date('2026-09-19T05:15:00.000Z'), // 12:15 Bangkok
        foodName: 'ข้าวกะเพราไก่',
        calories: 550,
      },
    ]);
    expect(text).toContain('📋 ประวัติวันนี้');
    expect(text).toContain('ไข่ 2 ฟอง — 140 kcal');
    expect(text).toContain('รวม 690 kcal');
  });

  it('returns empty history copy', () => {
    expect(buildHistoryMessage([])).toBe(NO_FOOD_LOGS_TODAY_TEXT);
  });

  it('coaches low protein from actual remaining', () => {
    const tip = buildDeterministicCoachTip({
      ...baseSummary(),
      remaining: { calories: 800, proteinG: 50, carbsG: 100, fatG: 20 },
    });
    expect(tip).toContain('โปรตีนยังขาดประมาณ 50g');
  });

  it('coaches near calorie target', () => {
    const tip = buildDeterministicCoachTip({
      ...baseSummary(),
      remaining: { calories: 180, proteinG: 10, carbsG: 20, fatG: 5 },
    });
    expect(tip).toContain('เหลือประมาณ 180 kcal');
  });

  it('coaches exceeded calories without shaming', () => {
    const tip = buildDeterministicCoachTip({
      ...baseSummary(),
      remaining: { calories: -150, proteinG: -5, carbsG: -10, fatG: -2 },
    });
    expect(tip).toContain('เกินเป้าประมาณ 150 kcal');
    expect(tip).toContain('ไม่ต้องอดมื้อถัดไป');
  });

  it('meal fallback uses remaining macros', () => {
    const text = buildMealRecommendationFallback({
      calories: 650,
      proteinG: 55,
      carbsG: 70,
      fatG: 20,
    });
    expect(text).toContain('650');
    expect(text).toContain('55');
  });
});
