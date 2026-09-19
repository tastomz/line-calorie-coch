import { RetentionCleanupService } from './retention-cleanup.service';

describe('RetentionCleanupService', () => {
  const pendingDeleteMany = jest.fn();
  const lineEventDeleteMany = jest.fn();

  const prisma = {
    pendingFoodAnalysis: { deleteMany: pendingDeleteMany },
    lineEvent: { deleteMany: lineEventDeleteMany },
  };

  const service = new RetentionCleanupService(prisma as never);

  beforeEach(() => {
    pendingDeleteMany.mockReset();
    lineEventDeleteMany.mockReset();
    pendingDeleteMany.mockResolvedValue({ count: 2 });
    lineEventDeleteMany.mockResolvedValue({ count: 5 });
  });

  it('deletes only expired pending food', async () => {
    const now = new Date('2026-09-19T12:00:00.000Z');
    const count = await service.deleteExpiredPendingFood(now);
    expect(count).toBe(2);
    expect(pendingDeleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
  });

  it('deletes line events older than retention window', async () => {
    const now = new Date('2026-09-19T12:00:00.000Z');
    const count = await service.deleteOldLineEvents(30, now);
    expect(count).toBe(5);
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(lineEventDeleteMany).toHaveBeenCalledWith({
      where: { processedAt: { lt: cutoff } },
    });
  });

  it('rejects invalid retention days', async () => {
    await expect(service.deleteOldLineEvents(0)).rejects.toThrow(
      /positive number/,
    );
  });

  it('run aggregates both cleanups', async () => {
    const result = await service.run({
      lineEventRetentionDays: 14,
      now: new Date('2026-09-19T12:00:00.000Z'),
    });
    expect(result).toEqual({
      expiredPendingDeleted: 2,
      oldLineEventsDeleted: 5,
    });
  });
});
