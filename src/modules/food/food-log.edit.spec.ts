import { NotFoundException } from '@nestjs/common';
import { dayBounds } from './day-bounds';
import { FoodLogService } from './food-log.service';

describe('FoodLogService today edit/delete isolation', () => {
  const foodLogs: Array<Record<string, unknown>> = [];
  const prisma = {
    foodLog: {
      findFirst: jest.fn(
        ({
          where,
        }: {
          where: {
            id: string;
            userId: string;
            eatenAt?: { gte: Date; lt: Date };
          };
        }) => {
          const row = foodLogs.find((r) => {
            if (r.id !== where.id || r.userId !== where.userId) return false;
            if (!where.eatenAt) return true;
            const eatenAt = r.eatenAt as Date;
            return eatenAt >= where.eatenAt.gte && eatenAt < where.eatenAt.lt;
          });
          return Promise.resolve(row ?? null);
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const idx = foodLogs.findIndex((r) => r.id === where.id);
          foodLogs[idx] = { ...foodLogs[idx], ...data };
          return Promise.resolve(foodLogs[idx]);
        },
      ),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        const idx = foodLogs.findIndex((r) => r.id === where.id);
        const [removed] = foodLogs.splice(idx, 1);
        return Promise.resolve(removed);
      }),
    },
  };

  const service = new FoodLogService(prisma as never);

  beforeEach(() => {
    foodLogs.length = 0;
    jest.clearAllMocks();
  });

  it('updates nutrition only for own today log', async () => {
    const { start } = dayBounds(new Date());
    foodLogs.push({
      id: 'a1',
      userId: 'user-a',
      eatenAt: new Date(start.getTime() + 3600_000),
      foodName: 'ไก่',
      calories: 600,
      proteinG: 30,
      carbsG: 50,
      fatG: 20,
    });

    const updated = await service.updateNutritionForUserToday('user-a', 'a1', {
      calories: 300,
      proteinG: 15,
      carbsG: 25,
      fatG: 10,
    });
    expect(updated.calories).toBe(300);
  });

  it('rejects other-user and yesterday logs with the same not-found', async () => {
    const { start } = dayBounds(new Date());
    foodLogs.push({
      id: 'b1',
      userId: 'user-b',
      eatenAt: new Date(start.getTime() + 3600_000),
      calories: 100,
    });
    foodLogs.push({
      id: 'old',
      userId: 'user-a',
      eatenAt: new Date(start.getTime() - 86_400_000),
      calories: 100,
    });

    await expect(
      service.updateNutritionForUserToday('user-a', 'b1', {
        calories: 1,
        proteinG: 1,
        carbsG: 1,
        fatG: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.deleteForUserToday('user-a', 'old'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(foodLogs).toHaveLength(2);
  });

  it('deletes own today log', async () => {
    const { start } = dayBounds(new Date());
    foodLogs.push({
      id: 'd1',
      userId: 'user-a',
      eatenAt: new Date(start.getTime() + 1000),
      foodName: 'ไข่',
      calories: 140,
    });
    const deleted = await service.deleteForUserToday('user-a', 'd1');
    expect(deleted.id).toBe('d1');
    expect(foodLogs).toHaveLength(0);
  });
});
