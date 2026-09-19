import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import {
  DailySummaryService,
  NutritionProfileMissingError,
} from './daily-summary.service';

describe('DailySummaryService', () => {
  const foodLogs: Array<Record<string, unknown>> = [];

  const prisma = {
    foodLog: {
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
    nutritionProfile: {
      findUnique: jest.fn(({ where }: { where: { userId: string } }) => {
        if (where.userId === 'user-a') {
          return Promise.resolve({
            dailyCalories: 2000,
            dailyProteinG: 140,
            dailyCarbsG: 220,
            dailyFatG: 55,
          });
        }
        if (where.userId === 'user-no-profile') {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          dailyCalories: 1800,
          dailyProteinG: 120,
          dailyCarbsG: 200,
          dailyFatG: 50,
        });
      }),
    },
  };

  const usersService = {
    findByIdOrThrow: jest.fn((userId: string) => {
      if (userId === 'missing') {
        return Promise.reject(new NotFoundException('User missing not found'));
      }
      return Promise.resolve({ id: userId });
    }),
  };

  const service = new DailySummaryService(
    prisma as unknown as PrismaService,
    usersService as unknown as UsersService,
  );

  beforeEach(() => {
    foodLogs.length = 0;
    jest.clearAllMocks();
  });

  it('aggregates multiple FoodLogs and computes remaining', async () => {
    const now = new Date();
    foodLogs.push(
      {
        userId: 'user-a',
        eatenAt: now,
        calories: 600,
        proteinG: 40,
        carbsG: 50,
        fatG: 20,
      },
      {
        userId: 'user-a',
        eatenAt: now,
        calories: 650,
        proteinG: 42,
        carbsG: 70,
        fatG: 22,
      },
    );

    const summary = await service.getDailySummary('user-a', now);

    expect(summary.consumed).toEqual({
      calories: 1250,
      proteinG: 82,
      carbsG: 120,
      fatG: 42,
    });
    expect(summary.target).toEqual({
      calories: 2000,
      proteinG: 140,
      carbsG: 220,
      fatG: 55,
    });
    expect(summary.remaining).toEqual({
      calories: 750,
      proteinG: 58,
      carbsG: 100,
      fatG: 13,
    });
  });

  it('returns zero consumed when no FoodLogs', async () => {
    const summary = await service.getDailySummary('user-a');
    expect(summary.consumed).toEqual({
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    });
    expect(summary.remaining.calories).toBe(2000);
  });

  it('throws when NutritionProfile is missing', async () => {
    await expect(
      service.getDailySummary('user-no-profile'),
    ).rejects.toBeInstanceOf(NutritionProfileMissingError);
  });

  it('verifies user exists before querying logs', async () => {
    await expect(service.getDailySummary('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.foodLog.findMany).not.toHaveBeenCalled();
  });

  it('isolates totals to the requested userId', async () => {
    const now = new Date();
    foodLogs.push(
      {
        userId: 'user-a',
        eatenAt: now,
        calories: 500,
        proteinG: 20,
        carbsG: 40,
        fatG: 10,
      },
      {
        userId: 'user-b',
        eatenAt: now,
        calories: 999,
        proteinG: 99,
        carbsG: 99,
        fatG: 99,
      },
    );

    const summaryA = await service.getDailySummary('user-a', now);
    const summaryB = await service.getDailySummary('user-b', now);

    expect(summaryA.consumed.calories).toBe(500);
    expect(summaryB.consumed.calories).toBe(999);
  });
});
