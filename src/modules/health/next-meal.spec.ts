import { localHour } from '../food/day-bounds';
import { buildNextMealHeader, nextMealBudget } from './next-meal';

describe('nextMealBudget', () => {
  const base = { dailyCalories: 2000, dailyProteinG: 120 };

  it('morning: breakfast gets 25% of the full day', () => {
    const b = nextMealBudget({
      ...base,
      hour: 7,
      eatenKcal: 0,
      eatenProteinG: 0,
    });
    expect(b).toMatchObject({
      slot: 'BREAKFAST',
      budgetKcal: 500,
      budgetProteinG: 30,
    });
  });

  it('evening: dinner gets everything that is left', () => {
    const b = nextMealBudget({
      ...base,
      hour: 18,
      eatenKcal: 1250,
      eatenProteinG: 70,
    });
    expect(b).toMatchObject({
      slot: 'DINNER',
      remainingKcal: 750,
      budgetKcal: 750,
      budgetProteinG: 50,
    });
  });

  it('lunch splits the remainder across lunch, snack and dinner', () => {
    const b = nextMealBudget({
      ...base,
      hour: 12,
      eatenKcal: 500,
      eatenProteinG: 30,
    });
    // 1500 × 0.3 / (0.3 + 0.15 + 0.3) = 600
    expect(b.budgetKcal).toBe(600);
  });

  it('late night: small snack only; nothing when the day is used up', () => {
    expect(
      nextMealBudget({ ...base, hour: 22, eatenKcal: 1000, eatenProteinG: 50 })
        .budgetKcal,
    ).toBe(200);
    const done = nextMealBudget({
      ...base,
      hour: 18,
      eatenKcal: 1950,
      eatenProteinG: 120,
    });
    expect(done.budgetKcal).toBe(0);
    expect(buildNextMealHeader(done, 2000)).toContain('ใช้งบแคลอรี่ครบแล้ว');
  });

  it('reads the Bangkok hour', () => {
    expect(localHour(new Date('2026-10-23T11:30:00Z'), 'Asia/Bangkok')).toBe(
      18,
    );
    expect(localHour(new Date('2026-10-23T17:00:00Z'), 'Asia/Bangkok')).toBe(0);
  });
});
