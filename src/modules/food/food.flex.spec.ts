import {
  buildFoodEstimateFlex,
  buildFoodSavedFlex,
  buildQuantityAdjustedFlex,
} from './food.flex';
import { buildDailyDashboardFlex, buildHistoryFlex } from './daily-coach.flex';

describe('LINE Flex nutrition UI', () => {
  const analysis = {
    foodName: 'ข้าวมันไก่',
    estimatedCalories: 600,
    proteinG: 30,
    carbsG: 70,
    fatG: 20,
    confidence: 0.8,
    assumptions: ['1 จานมาตรฐาน', 'น้ำมันปานกลาง'],
    estimatedQuantity: 1,
    quantityUnit: 'plate' as const,
  };

  it('builds food estimate flex with hierarchy and confirm actions', () => {
    const flex = buildFoodEstimateFlex(analysis);
    expect(flex.type).toBe('flex');
    expect(flex.altText).toContain('600');
    expect(flex.altText).toContain('ยังไม่บันทึก');
    const json = JSON.stringify(flex);
    expect(json).toContain('ข้าวมันไก่');
    expect(json).toContain('บันทึก');
    expect(json).toContain('แก้ไข');
    expect(json).toContain('ยกเลิก');
    expect(json).toContain('ยังไม่บันทึก');
    expect(json).toContain('ประเมินจาก');
    expect(json).not.toContain('สมมติฐาน:');
  });

  it('builds quantity-adjusted flex tied to food name', () => {
    const flex = buildQuantityAdjustedFlex(analysis, {
      originalQuantity: 1,
      consumedQuantity: 0.2,
      quantityUnit: 'plate',
    });
    const json = JSON.stringify(flex);
    expect(json).toContain('ข้าวมันไก่');
    expect(json).toContain('ปรับปริมาณ');
    expect(json).toContain('0.2');
    expect(flex.altText).toContain('kcal');
  });

  it('builds saved flex with meal / today / next sections', () => {
    const flex = buildFoodSavedFlex(analysis, {
      totals: { calories: 600, proteinG: 30, carbsG: 70, fatG: 20 },
      targets: {
        dailyCalories: 1800,
        dailyProteinG: 130,
        dailyCarbsG: 180,
        dailyFatG: 50,
      },
    });
    const json = JSON.stringify(flex);
    expect(json).toContain('บันทึกแล้ว');
    expect(json).toContain('วันนี้');
    expect(json).toContain('เหลือวันนี้');
    expect(json).toContain('มื้อถัดไป');
    expect(json).toContain('600');
    expect(json).toContain('1,800');
  });

  it('builds daily dashboard with meal list and progress', () => {
    const flex = buildDailyDashboardFlex({
      summary: {
        date: new Date(),
        consumed: { calories: 120, proteinG: 6, carbsG: 14, fatG: 4 },
        target: { calories: 1800, proteinG: 130, carbsG: 180, fatG: 50 },
        remaining: { calories: 1680, proteinG: 124, carbsG: 166, fatG: 46 },
      },
      logs: [
        {
          eatenAt: new Date('2026-09-19T03:59:00.000Z'),
          foodName: 'ข้าวมันไก่',
          calories: 120,
        },
      ],
    });
    const json = JSON.stringify(flex);
    expect(json).toContain('วันนี้');
    expect(json).toContain('ข้าวมันไก่');
    expect(json).toContain('1,800');
    expect(flex.altText).toContain('120');
  });

  it('builds compact history flex', () => {
    const flex = buildHistoryFlex([
      {
        eatenAt: new Date('2026-09-19T01:30:00.000Z'),
        foodName: 'ไข่ต้ม',
        calories: 140,
      },
    ]);
    expect(JSON.stringify(flex)).toContain('ไข่ต้ม');
    expect(flex.altText).toContain('140');
  });
});
