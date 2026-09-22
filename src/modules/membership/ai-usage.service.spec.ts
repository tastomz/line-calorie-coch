import { AiUsageService } from './ai-usage.service';
import { AiQuotaExceededError } from './membership.errors';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';

type UpdateManyArg = {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
};

describe('AiUsageService', () => {
  const upsert = jest.fn();
  const updateMany = jest.fn();
  const findUnique = jest.fn();
  const prisma = {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        aIUsage: { upsert, updateMany, findUnique },
      }),
    ),
  };

  const entitlement = {
    usageDateKey: jest.fn().mockReturnValue('2026-09-22'),
    getCurrentPlan: jest.fn().mockResolvedValue('FREE'),
    getDailyLimit: jest.fn().mockResolvedValue(5),
    fieldFor: jest.fn().mockReturnValue('foodTextCalls'),
    usedFor: jest.fn().mockReturnValue(5),
  };

  const service = new AiUsageService(
    prisma as never,
    entitlement as unknown as SubscriptionEntitlementService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    entitlement.usageDateKey.mockReturnValue('2026-09-22');
    entitlement.getCurrentPlan.mockResolvedValue('FREE');
    entitlement.getDailyLimit.mockResolvedValue(5);
    entitlement.fieldFor.mockReturnValue('foodTextCalls');
    upsert.mockResolvedValue({});
    updateMany.mockResolvedValue({ count: 1 });
  });

  it('increments usage when under limit', async () => {
    await service.consumeAiUsage('user-a', 'FOOD_TEXT');
    expect(upsert).toHaveBeenCalled();
    const calls = updateMany.mock.calls as unknown as [UpdateManyArg][];
    expect(calls[0][0]).toEqual({
      where: {
        userId: 'user-a',
        usageDate: '2026-09-22',
        foodTextCalls: { lt: 5 },
      },
      data: {
        foodTextCalls: { increment: 1 },
        totalCalls: { increment: 1 },
      },
    });
  });

  it('throws AiQuotaExceededError when updateMany matches zero rows', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValue({
      foodTextCalls: 5,
      visionCalls: 0,
      adjustmentCalls: 0,
      coachCalls: 0,
      classifyCalls: 0,
      totalCalls: 5,
    });
    await expect(
      service.consumeAiUsage('user-a', 'FOOD_TEXT'),
    ).rejects.toBeInstanceOf(AiQuotaExceededError);
  });

  it('uses separate fields per operation', async () => {
    entitlement.fieldFor.mockReturnValue('visionCalls');
    entitlement.getDailyLimit.mockResolvedValue(2);
    await service.consumeAiUsage('user-a', 'FOOD_VISION');
    const calls = updateMany.mock.calls as unknown as [UpdateManyArg][];
    expect(calls[0][0].where).toMatchObject({
      visionCalls: { lt: 2 },
    });
  });
});
