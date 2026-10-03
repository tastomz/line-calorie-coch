import { shiftDaysAgoKeepingTime } from './day-bounds';
import {
  buildDayRangeFlex,
  buildDayRangeText,
  buildPastDayMessage,
} from './food-day.messages';
import { buildFoodEstimateMessage } from './food.messages';

const target = { calories: 2000, proteinG: 140, carbsG: 220, fatG: 55 };

function row(daysAgo: number, mealCount: number, calories: number) {
  return {
    daysAgo,
    date: shiftDaysAgoKeepingTime(daysAgo),
    mealCount,
    consumed: { calories, proteinG: 0, carbsG: 0, fatG: 0 },
  };
}

describe('buildPastDayMessage', () => {
  it('lists meals with totals vs target and the yesterday hints', () => {
    const day = shiftDaysAgoKeepingTime(1);
    const text = buildPastDayMessage({
      day,
      daysAgo: 1,
      logs: [{ eatenAt: day, foodName: 'ผัดไทย', calories: 700 }],
      summary: {
        date: day,
        consumed: { calories: 700, proteinG: 25, carbsG: 90, fatG: 25 },
        target,
        remaining: { calories: 1300, proteinG: 115, carbsG: 130, fatG: 30 },
      },
    });

    expect(text).toContain('📅 เมื่อวาน');
    expect(text).toContain('ผัดไทย   700 kcal');
    expect(text).toContain('🔥 พลังงาน 700 / 2,000 kcal');
    expect(text).toContain('🥩 โปรตีน 25 / 140 g');
    expect(text).toContain('เมื่อวาน ข้าวมันไก่');
    expect(text).toContain('ย้อนหลัง');
    // past days must not talk about what is "left today" or the next meal
    expect(text).not.toContain('เหลือวันนี้');
    expect(text).not.toContain('มื้อถัดไป');
  });

  it('falls back to a plain total when there is no profile', () => {
    const day = shiftDaysAgoKeepingTime(2);
    const text = buildPastDayMessage({
      day,
      daysAgo: 2,
      logs: [{ eatenAt: day, foodName: 'ส้มตำ', calories: 150 }],
      summary: null,
    });
    expect(text).toContain('รวม 150 kcal');
    // logging backfill is yesterday-only, so older days do not advertise it
    expect(text).not.toContain('เมื่อวาน ข้าวมันไก่');
  });

  it('explains an empty day', () => {
    const day = shiftDaysAgoKeepingTime(1);
    const text = buildPastDayMessage({
      day,
      daysAgo: 1,
      logs: [],
      summary: null,
    });
    expect(text).toContain('ยังไม่มีรายการอาหารในวันนั้น');
  });
});

describe('day range overview', () => {
  const days = [row(0, 1, 400), row(1, 3, 1900), row(2, 0, 0)];

  it('text shows kcal vs target and percent, empty days as no record', () => {
    const text = buildDayRangeText(days, target);
    expect(text).toContain('ย้อนหลัง 3 วัน');
    expect(text).toContain('วันนี้  400 / 2,000 kcal  (20%)');
    expect(text).toContain('เมื่อวาน  1,900 / 2,000 kcal  (95%)');
    expect(text).toContain('ไม่มีบันทึก');
  });

  it('works without a target', () => {
    const text = buildDayRangeText(days, null);
    expect(text).toContain('1,900 kcal');
    expect(text).not.toContain('%');
  });

  it('flex rows open each day via postback and never expose commands as text', () => {
    const payload = buildDayRangeFlex(days, target);
    const json = JSON.stringify(payload);

    expect(payload.type).toBe('flex');
    for (const r of days) {
      expect(json).toContain(`"data":"foodday:${r.daysAgo}"`);
    }
    expect(json).not.toContain('"type":"message"');
    // postback must carry a friendly displayText, not the raw command
    expect(json).toContain('"displayText":"📅 เมื่อวาน"');
    expect(json).not.toContain('"displayText":"foodday');
  });
});

describe('buildFoodEstimateMessage past-day label', () => {
  const analysis = {
    foodName: 'ข้าวมันไก่',
    estimatedCalories: 600,
    proteinG: 30,
    carbsG: 70,
    fatG: 20,
    confidence: 0.8,
    assumptions: [],
    estimatedQuantity: 1,
    quantityUnit: 'plate' as const,
  };
  const base = {
    originalQuantity: 1,
    consumedQuantity: 1,
    quantityUnit: 'plate',
  };

  it('marks entries dated on a previous day', () => {
    const text = buildFoodEstimateMessage(analysis, {
      ...base,
      eatenAt: shiftDaysAgoKeepingTime(1),
    });
    expect(text.startsWith('📅 บันทึกย้อนหลัง: เมื่อวาน')).toBe(true);
  });

  it.each([
    ['no eatenAt', undefined],
    ['null eatenAt', null],
    ['today', new Date()],
  ])('leaves the card unchanged for %s', (_label, eatenAt) => {
    const text = buildFoodEstimateMessage(analysis, { ...base, eatenAt });
    expect(text.startsWith('🍽️ ประเมินมื้อนี้')).toBe(true);
  });
});
