import { MealType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DailyTotalsService } from './daily-totals.service';
import { FoodLogService } from './food-log.service';
import { PendingFoodService } from './pending-food.service';

describe('FoodLog + pending isolation', () => {
  const foodLogs: Array<Record<string, unknown>> = [];
  const pendings = new Map<string, Record<string, unknown>>();

  const prisma = {
    foodLog: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `log-${foodLogs.length + 1}`, ...data };
        foodLogs.push(row);
        return Promise.resolve(row);
      }),
      findFirst: jest.fn(
        ({ where }: { where: { id: string; userId: string } }) =>
          Promise.resolve(
            foodLogs.find(
              (row) => row.id === where.id && row.userId === where.userId,
            ) ?? null,
          ),
      ),
      findMany: jest.fn(
        ({
          where,
        }: {
          where: { userId: string; eatenAt: { gte: Date; lt: Date } };
        }) =>
          Promise.resolve(
            foodLogs.filter((row) => {
              if (row.userId !== where.userId) return false;
              const eatenAt = row.eatenAt as Date;
              return eatenAt >= where.eatenAt.gte && eatenAt < where.eatenAt.lt;
            }),
          ),
      ),
    },
    pendingFoodAnalysis: {
      upsert: jest.fn(
        ({
          where,
          create,
          update,
        }: {
          where: { userId: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const existing = pendings.get(where.userId);
          const row = existing
            ? { ...existing, ...update, userId: where.userId }
            : { id: `p-${where.userId}`, ...create };
          pendings.set(where.userId, row);
          return Promise.resolve(row);
        },
      ),
      findUnique: jest.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(pendings.get(where.userId) ?? null),
      ),
      deleteMany: jest.fn(({ where }: { where: { userId: string } }) => {
        pendings.delete(where.userId);
        return Promise.resolve({ count: 1 });
      }),
    },
    nutritionProfile: {
      findUnique: jest.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(
          where.userId === 'user-a'
            ? {
                dailyCalories: 2000,
                dailyProteinG: 140,
                dailyCarbsG: 200,
                dailyFatG: 60,
              }
            : null,
        ),
      ),
    },
  };

  const foodLogService = new FoodLogService(prisma as unknown as PrismaService);
  const pendingFoodService = new PendingFoodService(
    prisma as unknown as PrismaService,
  );
  const dailyTotalsService = new DailyTotalsService(
    prisma as unknown as PrismaService,
  );

  beforeEach(() => {
    foodLogs.length = 0;
    pendings.clear();
    jest.clearAllMocks();
  });

  it('saves FoodLog only for the confirming user', async () => {
    const analysis = {
      foodName: 'ข้าว',
      estimatedCalories: 650,
      proteinG: 35,
      carbsG: 70,
      fatG: 25,
      confidence: 0.8,
      assumptions: [],
      estimatedQuantity: 1,
      quantityUnit: 'plate',
    };

    await pendingFoodService.upsertPending('user-a', analysis);
    const pending = await pendingFoodService.requireActiveForUser('user-a');
    await foodLogService.createFromAnalysis(
      'user-a',
      pendingFoodService.toAnalysisResult(pending),
    );

    expect(foodLogs).toHaveLength(1);
    expect(foodLogs[0].userId).toBe('user-a');
    expect(foodLogs[0].mealType).toBe(MealType.UNKNOWN);
  });

  it('does not save FoodLog when cancelled', async () => {
    await pendingFoodService.upsertPending('user-a', {
      foodName: 'ข้าว',
      estimatedCalories: 500,
      proteinG: 20,
      carbsG: 60,
      fatG: 15,
      confidence: 0.7,
      assumptions: [],
      estimatedQuantity: 1,
      quantityUnit: 'plate',
    });
    await pendingFoodService.clearForUser('user-a');
    expect(await pendingFoodService.getActiveForUser('user-a')).toBeNull();
    expect(foodLogs).toHaveLength(0);
  });

  it('calculates daily totals from FoodLog rows', async () => {
    await foodLogService.createForUser('user-a', {
      foodName: 'มื้อ1',
      calories: 600,
      proteinG: 30,
      carbsG: 70,
      fatG: 20,
    });
    await foodLogService.createForUser('user-a', {
      foodName: 'มื้อ2',
      calories: 400,
      proteinG: 20,
      carbsG: 40,
      fatG: 10,
    });

    const totals = await dailyTotalsService.getTotalsForUserOnDate('user-a');
    expect(totals).toEqual({
      calories: 1000,
      proteinG: 50,
      carbsG: 110,
      fatG: 30,
    });
  });

  it('User A cannot access User B FoodLog', async () => {
    const log = await foodLogService.createForUser('user-b', {
      foodName: 'ลับ',
      calories: 100,
      proteinG: 1,
      carbsG: 1,
      fatG: 1,
    });

    await expect(
      foodLogService.findByIdForUser('user-a', log.id),
    ).rejects.toThrow(/FoodLog not found/);
  });

  it('User A cannot confirm User B pending food', async () => {
    await pendingFoodService.upsertPending('user-b', {
      foodName: 'ของ B',
      estimatedCalories: 300,
      proteinG: 10,
      carbsG: 20,
      fatG: 10,
      confidence: 0.6,
      assumptions: [],
      estimatedQuantity: 1,
      quantityUnit: 'plate',
    });

    await expect(
      pendingFoodService.requireActiveForUser('user-a'),
    ).rejects.toThrow(/No pending food analysis/);
  });

  it('replaces pending analysis when a new food arrives (V1)', async () => {
    await pendingFoodService.upsertPending('user-a', {
      foodName: 'เก่า',
      estimatedCalories: 100,
      proteinG: 1,
      carbsG: 1,
      fatG: 1,
      confidence: 0.5,
      assumptions: [],
      estimatedQuantity: 1,
      quantityUnit: 'plate',
    });
    await pendingFoodService.upsertPending('user-a', {
      foodName: 'ใหม่',
      estimatedCalories: 200,
      proteinG: 2,
      carbsG: 2,
      fatG: 2,
      confidence: 0.9,
      assumptions: ['ใหม่'],
      estimatedQuantity: 1,
      quantityUnit: 'plate',
    });

    const pending = await pendingFoodService.getActiveForUser('user-a');
    expect(pending?.foodName).toBe('ใหม่');
    expect(pending?.calories).toBe(200);
  });
});
