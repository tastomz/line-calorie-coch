import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { zonedLocalToUtc } from '../food/day-bounds';
import { WeightLogService, average } from './weight-log.service';

describe('WeightLogService', () => {
  const weightLogs: Array<Record<string, unknown>> = [];
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });

  const tx = {
    weightLog: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `w-${weightLogs.length + 1}`,
          createdAt: new Date(),
          ...data,
        };
        weightLogs.push(row);
        return Promise.resolve(row);
      }),
    },
    nutritionProfile: {
      updateMany,
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
    weightLog: {
      findMany: jest.fn(
        ({
          where,
        }: {
          where: { userId: string; recordedAt: { gte: Date; lt: Date } };
        }) =>
          Promise.resolve(
            weightLogs.filter((row) => {
              if (row.userId !== where.userId) return false;
              const recordedAt = row.recordedAt as Date;
              return (
                recordedAt >= where.recordedAt.gte &&
                recordedAt < where.recordedAt.lt
              );
            }),
          ),
      ),
      findFirst: jest.fn(
        ({
          where,
          orderBy,
        }: {
          where: { userId: string; id?: string };
          orderBy?: { recordedAt: 'asc' | 'desc' };
        }) => {
          const rows = weightLogs.filter((row) => {
            if (row.userId !== where.userId) return false;
            if (where.id && row.id !== where.id) return false;
            return true;
          });
          if (orderBy?.recordedAt === 'desc') {
            rows.sort(
              (a, b) =>
                (b.recordedAt as Date).getTime() -
                (a.recordedAt as Date).getTime(),
            );
          } else if (orderBy?.recordedAt === 'asc') {
            rows.sort(
              (a, b) =>
                (a.recordedAt as Date).getTime() -
                (b.recordedAt as Date).getTime(),
            );
          }
          return Promise.resolve(rows[0] ?? null);
        },
      ),
    },
    nutritionProfile: {
      findUnique: jest.fn(({ where }: { where: { userId: string } }) => {
        if (where.userId === 'user-a') {
          return Promise.resolve({ targetWeightKg: 74 });
        }
        return Promise.resolve(null);
      }),
    },
  };

  const usersService = {
    findByIdOrThrow: jest.fn((userId: string) => {
      if (userId === 'missing') {
        return Promise.reject(new NotFoundException('missing'));
      }
      return Promise.resolve({ id: userId });
    }),
  };

  const service = new WeightLogService(
    prisma as unknown as PrismaService,
    usersService as unknown as UsersService,
  );

  beforeEach(() => {
    weightLogs.length = 0;
    jest.clearAllMocks();
    updateMany.mockResolvedValue({ count: 1 });
  });

  function atBangkok(year: number, month: number, day: number, hour = 9) {
    return zonedLocalToUtc({ year, month, day, hour }, 'Asia/Bangkok');
  }

  it('creates WeightLog for user and syncs profile currentWeightKg', async () => {
    const log = await service.createForUser('user-a', 84.2);
    expect(log.userId).toBe('user-a');
    expect(log.weightKg).toBe(84.2);
    expect(weightLogs).toHaveLength(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-a' },
      data: { currentWeightKg: 84.2 },
    });
  });

  it('allows multiple WeightLogs on the same local day', async () => {
    const day = atBangkok(2026, 9, 19, 8);
    await service.createForUser('user-a', 84.0, day);
    await service.createForUser('user-a', 84.4, atBangkok(2026, 9, 19, 20));

    const avg = await service.getTodayAverageKg('user-a', day);
    expect(avg).toBe(84.2);
    expect(weightLogs).toHaveLength(2);
  });

  it('computes daily average helper', () => {
    expect(average([84, 85, 84.5])).toBeCloseTo(84.5, 5);
  });

  it('returns recent daily averages newest first', async () => {
    await service.createForUser('user-a', 85.3, atBangkok(2026, 9, 13));
    await service.createForUser('user-a', 84.2, atBangkok(2026, 9, 19));
    await service.createForUser('user-a', 84.6, atBangkok(2026, 9, 18));

    const recent = await service.getRecentDailyAverages(
      'user-a',
      7,
      atBangkok(2026, 9, 19, 12),
    );

    expect(recent[0].averageKg).toBe(84.2);
    expect(recent.map((d) => d.dateKey)).toEqual([
      '2026-09-19',
      '2026-09-18',
      '2026-09-13',
    ]);
  });

  it('computes 7-day vs previous 7-day trend from daily averages', async () => {
    for (let day = 6; day <= 12; day += 1) {
      await service.createForUser('user-a', 85.2, atBangkok(2026, 9, day));
    }
    for (let day = 13; day <= 19; day += 1) {
      await service.createForUser('user-a', 84.5, atBangkok(2026, 9, day));
    }

    const trend = await service.getSevenDayTrend(
      'user-a',
      atBangkok(2026, 9, 19, 12),
    );

    expect(trend).not.toBeNull();
    expect(trend!.recentAverageKg).toBeCloseTo(84.5, 5);
    expect(trend!.previousAverageKg).toBeCloseTo(85.2, 5);
    expect(trend!.changeKg).toBeCloseTo(-0.7, 5);
  });

  it('returns null trend when a window lacks data', async () => {
    await service.createForUser('user-a', 84.2, atBangkok(2026, 9, 19));
    const trend = await service.getSevenDayTrend(
      'user-a',
      atBangkok(2026, 9, 19, 12),
    );
    expect(trend).toBeNull();
  });

  it('loads target progress from NutritionProfile + latest WeightLog', async () => {
    await service.createForUser('user-a', 84.2, atBangkok(2026, 9, 19));
    const progress = await service.getTargetProgress('user-a');
    expect(progress).toEqual({
      latestKg: 84.2,
      targetKg: 74,
      remainingKg: 10.2,
    });
  });

  it('isolates WeightLogs by userId', async () => {
    await service.createForUser('user-b', 99.9, atBangkok(2026, 9, 19));
    const logB = weightLogs[0] as { id: string };

    await expect(service.findByIdForUser('user-a', logB.id)).rejects.toThrow(
      /WeightLog not found/,
    );

    const avgA = await service.getTodayAverageKg(
      'user-a',
      atBangkok(2026, 9, 19),
    );
    const avgB = await service.getTodayAverageKg(
      'user-b',
      atBangkok(2026, 9, 19),
    );
    expect(avgA).toBeNull();
    expect(avgB).toBe(99.9);
  });

  it('computes change since first log', async () => {
    await service.createForUser('user-a', 90, atBangkok(2026, 8, 1));
    await service.createForUser('user-a', 84.2, atBangkok(2026, 9, 19));
    const change = await service.getChangeSinceFirst('user-a');
    expect(change).toEqual({
      earliestKg: 90,
      latestKg: 84.2,
      changeKg: -5.8,
    });
  });
});
