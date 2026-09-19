import {
  PendingFoodConfirmError,
  PendingFoodService,
} from './pending-food.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PendingFoodService.confirmPendingAtomic', () => {
  const pendings = new Map<string, Record<string, unknown>>();
  const foodLogs: Array<Record<string, unknown>> = [];

  function makePending(userId: string) {
    return {
      id: `pending-${userId}`,
      userId,
      foodName: 'ข้าว',
      calories: 500,
      proteinG: 20,
      carbsG: 60,
      fatG: 15,
      confidence: 0.8,
      assumptions: '[]',
      imageUrl: null,
      originalQuantity: 1,
      quantityUnit: 'plate',
      consumedQuantity: 1,
      originalCalories: 500,
      originalProteinG: 20,
      originalCarbsG: 60,
      originalFatG: 15,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    };
  }

  const tx = {
    pendingFoodAnalysis: {
      findUnique: jest.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(pendings.get(where.userId) ?? null),
      ),
      deleteMany: jest.fn(
        ({ where }: { where: { id?: string; userId: string } }) => {
          const existing = pendings.get(where.userId);
          if (!existing) {
            return Promise.resolve({ count: 0 });
          }
          if (where.id && existing.id !== where.id) {
            return Promise.resolve({ count: 0 });
          }
          pendings.delete(where.userId);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    foodLog: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `log-${foodLogs.length + 1}`, ...data };
        foodLogs.push(row);
        return Promise.resolve(row);
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
    pendingFoodAnalysis: {
      findUnique: jest.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(pendings.get(where.userId) ?? null),
      ),
      deleteMany: jest.fn(({ where }: { where: { userId: string } }) => {
        pendings.delete(where.userId);
        return Promise.resolve({ count: 1 });
      }),
    },
  };

  const service = new PendingFoodService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    pendings.clear();
    foodLogs.length = 0;
    pendings.set('user-a', makePending('user-a'));
  });

  it('creates exactly one FoodLog and consumes pending', async () => {
    const result = await service.confirmPendingAtomic('user-a');
    expect(result.foodLog.foodName).toBe('ข้าว');
    expect(result.analysis.estimatedCalories).toBe(500);
    expect(pendings.has('user-a')).toBe(false);
    expect(foodLogs).toHaveLength(1);
  });

  it('rejects a second confirm for the same pending (no duplicate FoodLog)', async () => {
    await service.confirmPendingAtomic('user-a');
    await expect(service.confirmPendingAtomic('user-a')).rejects.toBeInstanceOf(
      PendingFoodConfirmError,
    );
    expect(foodLogs).toHaveLength(1);
  });

  it('rejects confirm for another userId (cross-user)', async () => {
    await expect(service.confirmPendingAtomic('user-b')).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(foodLogs).toHaveLength(0);
    expect(pendings.has('user-a')).toBe(true);
  });

  it('rejects expired pending and clears it', async () => {
    pendings.set('user-a', {
      ...makePending('user-a'),
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(service.confirmPendingAtomic('user-a')).rejects.toMatchObject({
      code: 'expired',
    });
    expect(foodLogs).toHaveLength(0);
  });

  it('serializes concurrent confirms to a single FoodLog', async () => {
    // Simulate racing deletes: first wins, second deleteMany returns 0.
    let deletes = 0;
    tx.pendingFoodAnalysis.deleteMany.mockImplementation(() => {
      deletes += 1;
      if (deletes === 1) {
        pendings.delete('user-a');
        return Promise.resolve({ count: 1 });
      }
      return Promise.resolve({ count: 0 });
    });
    // Both find the pending before either deletes.
    tx.pendingFoodAnalysis.findUnique.mockResolvedValue(makePending('user-a'));

    const [a, b] = await Promise.allSettled([
      service.confirmPendingAtomic('user-a'),
      service.confirmPendingAtomic('user-a'),
    ]);

    const fulfilled = [a, b].filter((r) => r.status === 'fulfilled');
    const rejected = [a, b].filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(foodLogs).toHaveLength(1);
  });
});
