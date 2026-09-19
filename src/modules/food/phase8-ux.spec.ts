import {
  buildFoodEstimateMessage,
  buildQuantityAdjustedMessage,
  buildProfileMessage,
  FOOD_CANCELLED_TEXT,
  FOOD_RATE_LIMITED_TEXT,
} from './food.messages';
import { buildDailyCoachSummaryMessage } from './daily-coach.messages';
import { detectCoachIntent } from './coach-intent';

describe('Phase 8 UX messages', () => {
  it('formats a concise food estimate', () => {
    const msg = buildFoodEstimateMessage({
      foodName: 'ข้าวกะเพราไก่ไข่ดาว',
      estimatedCalories: 650,
      proteinG: 35,
      carbsG: 70,
      fatG: 25,
      confidence: 0.8,
      assumptions: ['1 จาน'],
      estimatedQuantity: 1,
      quantityUnit: 'plate',
    });
    expect(msg).toContain('🍽️ ประเมินมื้อนี้');
    expect(msg).toContain('650 kcal');
    expect(msg).toContain('P 35g · C 70g · F 25g');
    expect(msg).toContain('ความมั่นใจ 80%');
  });

  it('formats quantity-adjusted card', () => {
    const msg = buildQuantityAdjustedMessage(
      {
        foodName: 'ซูชิ',
        estimatedCalories: 180,
        proteinG: 7.5,
        carbsG: 24,
        fatG: 6,
        confidence: 0.8,
        assumptions: [],
        estimatedQuantity: 3,
        quantityUnit: 'piece',
      },
      {
        originalQuantity: 10,
        consumedQuantity: 3,
        quantityUnit: 'piece',
      },
    );
    expect(msg).toContain('🍣 ปรับเป็น 3 ชิ้น');
    expect(msg).toContain('3 / 10');
    expect(msg).toContain('180 kcal');
  });

  it('formats daily summary with emoji macros', () => {
    const msg = buildDailyCoachSummaryMessage({
      date: new Date(),
      consumed: { calories: 1250, proteinG: 82, carbsG: 120, fatG: 42 },
      target: { calories: 2000, proteinG: 140, carbsG: 220, fatG: 55 },
      remaining: { calories: 750, proteinG: 58, carbsG: 100, fatG: 13 },
    });
    expect(msg).toContain('📊 วันนี้');
    expect(msg).toContain('🔥');
    expect(msg).toContain('เหลือ 750 kcal');
  });

  it('formats profile summary', () => {
    const msg = buildProfileMessage({
      currentWeightKg: 84.2,
      targetWeightKg: 74,
      dailyCalories: 2000,
      dailyProteinG: 140,
      dailyCarbsG: 220,
      dailyFatG: 55,
    });
    expect(msg).toContain('👤 โปรไฟล์');
    expect(msg).toContain('84.2 kg');
    expect(msg).toContain('แก้ไขโปรไฟล์');
  });

  it('uses friendly error copy', () => {
    expect(FOOD_CANCELLED_TEXT).toContain('ยกเลิก');
    expect(FOOD_RATE_LIMITED_TEXT).toContain('ถี่เกินไป');
  });
});

describe('detectCoachIntent Phase 8', () => {
  it('detects meal suggestions and daily NL', () => {
    expect(detectCoachIntent('เย็นนี้กินอะไรดี')).toBe('meal_recommendation');
    expect(detectCoachIntent('เหลือกินอะไรได้บ้าง')).toBe(
      'meal_recommendation',
    );
    expect(detectCoachIntent('วันนี้กินไปกี่แคล')).toBe('calories_consumed');
    expect(detectCoachIntent('โปรตีนเหลือเท่าไร')).toBe('protein_remaining');
    expect(detectCoachIntent('วันนี้กินอะไรไปแล้ว')).toBe('history');
    expect(detectCoachIntent('วันนี้โอเคไหม')).toBe('today_summary');
  });

  it('routes medical-ish questions safely', () => {
    expect(detectCoachIntent('เบาหวานกินอะไรดี')).toBe('medical');
  });
});
