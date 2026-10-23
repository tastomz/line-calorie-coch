import { AdminDashboardService } from './admin-dashboard.service';

describe('AdminDashboardService.endTrial', () => {
  function setup(trialRows: number, paid: { id: string } | null) {
    const tx = {
      subscription: {
        updateMany: jest.fn().mockResolvedValue({ count: trialRows }),
        findFirst: jest.fn().mockResolvedValue(paid),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: (fn: (t: typeof tx) => Promise<number>) => fn(tx),
    };
    const svc = new AdminDashboardService(prisma as never, {} as never);
    return { svc, tx };
  }
  const now = new Date('2026-10-23T13:40:00Z');

  it('expires TRIALING Pro rows now', async () => {
    const { svc, tx } = setup(1, null);
    await expect(svc.endTrial('u1', now)).resolves.toBe(1);
    expect(tx.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', plan: 'PRO', status: 'TRIALING' },
      data: { status: 'EXPIRED', trialEndsAt: now, currentPeriodEnd: now },
    });
    expect(tx.subscription.update).not.toHaveBeenCalled();
  });

  it('keeps a running paid Pro as the latest subscription', async () => {
    const { svc, tx } = setup(1, { id: 'paid1' });
    await svc.endTrial('u1', now);
    expect(tx.subscription.update).toHaveBeenCalledWith({
      where: { id: 'paid1' },
      data: { updatedAt: new Date(now.getTime() + 1) },
    });
  });

  it('returns 0 when the user is not on Trial', async () => {
    const { svc, tx } = setup(0, null);
    await expect(svc.endTrial('u1', now)).resolves.toBe(0);
    expect(tx.subscription.findFirst).not.toHaveBeenCalled();
  });
});
