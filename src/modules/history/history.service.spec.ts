import { BadRequestException } from '@nestjs/common';
import { HistoryService, RESET_CONFIRM_TEXT } from './history.service';
import { weightProgress } from './weight-progress';

describe('weightProgress', () => {
  it('lose 80 → 70, now 75 = 50%', () => {
    expect(weightProgress(80, 75, 70)).toMatchObject({
      percent: 50,
      achievedKg: 5,
      remainingKg: 5,
      direction: 'lose',
    });
  });
  it('gain 50 → 60, now 52.5 = 25%', () => {
    expect(weightProgress(50, 52.5, 60)).toMatchObject({
      percent: 25,
      direction: 'gain',
    });
  });
  it('clamps: going the wrong way is 0%, overshooting is 100%', () => {
    expect(weightProgress(80, 82, 70).percent).toBe(0);
    expect(weightProgress(80, 68, 70)).toMatchObject({
      percent: 100,
      remainingKg: 0,
    });
  });
  it('maintain: 100% within ±1 kg of target', () => {
    expect(weightProgress(60, 60.8, 60).percent).toBe(100);
    expect(weightProgress(60, 63, 60).direction).toBe('maintain');
    expect(weightProgress(60, 63, 60).percent).toBeLessThan(100);
  });
});

describe('HistoryService', () => {
  const tx: unknown[] = [];
  const del = () => ({ deleteMany: jest.fn((a: unknown) => a) });
  const prisma = {
    $transaction: jest.fn((ops: unknown[]) => {
      tx.push(...ops);
      return Promise.resolve(ops);
    }),
    foodLog: { ...del(), findMany: jest.fn() },
    pendingFoodAnalysis: del(),
    weightLog: { ...del(), findMany: jest.fn() },
    sleepLog: { ...del(), findMany: jest.fn() },
    exerciseLog: { ...del(), findMany: jest.fn() },
    activityDailyLog: del(),
    hydrationLog: { ...del(), findMany: jest.fn() },
    recoveryLog: del(),
    bodyScan: del(),
    pendingBodyScan: del(),
    mealPlan: del(),
    weeklyHealthReview: del(),
    nutritionProfile: { ...del(), findUnique: jest.fn() },
    user: { update: jest.fn((a: unknown) => a) },
    subscription: { deleteMany: jest.fn() },
    promoRedemption: { deleteMany: jest.fn() },
  };
  const weights = {
    createForUser: jest.fn((_u: string, kg: number) =>
      Promise.resolve({ weightKg: kg, recordedAt: new Date() }),
    ),
    getLatestForUser: jest.fn(),
    getEarliestForUser: jest.fn(),
  };
  const service = new HistoryService(prisma as never, weights as never);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.length = 0;
  });

  it('refuses to wipe without the exact confirmation text', async () => {
    await expect(service.resetGoal('u1', 'ok')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('wipes health data, restarts onboarding, keeps membership', async () => {
    await service.resetGoal('u1', RESET_CONFIRM_TEXT);
    for (const m of [
      'foodLog',
      'weightLog',
      'sleepLog',
      'exerciseLog',
      'hydrationLog',
      'bodyScan',
      'mealPlan',
      'weeklyHealthReview',
      'nutritionProfile',
    ] as const) {
      expect(prisma[m].deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
    }
    const update = prisma.user.update.mock.calls[0][0] as {
      where: { id: string };
      data: { onboardingState: string };
    };
    expect(update.where).toEqual({ id: 'u1' });
    expect(update.data.onboardingState).toBe('NOT_STARTED');
    expect(prisma.subscription.deleteMany).not.toHaveBeenCalled();
    expect(prisma.promoRedemption.deleteMany).not.toHaveBeenCalled();
  });

  it.each([[10], [301], ['70'], [NaN]])('rejects weight %p', async (kg) => {
    await expect(service.logWeight('u1', kg)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('logs a weight rounded to 0.1 kg', async () => {
    await service.logWeight('u1', 72.345);
    expect(weights.createForUser).toHaveBeenCalledWith('u1', 72.3);
  });

  it('builds 7 days (today first) and progress from start weight', async () => {
    const now = new Date('2026-10-23T05:00:00Z'); // 12:00 Bangkok
    prisma.nutritionProfile.findUnique.mockResolvedValue({
      dailyCalories: 2000,
      dailyProteinG: 120,
      startWeightKg: 80,
      currentWeightKg: 76,
      targetWeightKg: 70,
    });
    prisma.foodLog.findMany.mockResolvedValue([
      {
        foodName: 'ข้าวมันไก่',
        calories: 600.4,
        proteinG: 25,
        mealType: 'LUNCH',
        eatenAt: new Date('2026-10-23T04:30:00Z'),
      },
      {
        foodName: 'กาแฟ',
        calories: 120,
        proteinG: 4,
        mealType: 'SNACK',
        eatenAt: new Date('2026-10-22T02:00:00Z'),
      },
    ]);
    prisma.hydrationLog.findMany.mockResolvedValue([
      { recordedAt: new Date('2026-10-23T03:00:00Z'), amountMl: 500 },
    ]);
    prisma.sleepLog.findMany.mockResolvedValue([
      { sleepDate: '2026-10-23', durationMinutes: 390 },
    ]);
    prisma.exerciseLog.findMany.mockResolvedValue([]);
    prisma.weightLog.findMany.mockResolvedValue([
      { recordedAt: new Date('2026-10-23T01:00:00Z'), weightKg: 75 },
    ]);
    weights.getLatestForUser.mockResolvedValue({ weightKg: 75 });
    weights.getEarliestForUser.mockResolvedValue({ weightKg: 79 });

    const h = await service.getHistory('u1', 7, now);
    expect(h.days.map((d) => d.date)).toEqual([
      '2026-10-23',
      '2026-10-22',
      '2026-10-21',
      '2026-10-20',
      '2026-10-19',
      '2026-10-18',
      '2026-10-17',
    ]);
    expect(h.days[0]).toMatchObject({
      calories: 600,
      waterMl: 500,
      sleepMinutes: 390,
      weightKg: 75,
    });
    expect(h.days[1].calories).toBe(120);
    expect(h.progress).toMatchObject({
      startKg: 80,
      currentKg: 75,
      percent: 50,
    });
  });
});
