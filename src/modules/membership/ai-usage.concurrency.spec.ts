import { AiUsageService } from './ai-usage.service';
import { AiQuotaExceededError } from './membership.errors';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';

/**
 * Simulates concurrent consume attempts against a shared in-memory counter
 * using the same conditional-update pattern as production (updateMany where lt:limit).
 */
describe('AiUsageService concurrency safety', () => {
  it('cannot exceed daily limit under concurrent consumes', async () => {
    let foodTextCalls = 0;
    const limit = 2;

    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          aIUsage: {
            upsert: jest.fn().mockResolvedValue({}),
            updateMany: jest.fn(
              ({ where }: { where: { foodTextCalls?: { lt: number } } }) => {
                const lt = where.foodTextCalls?.lt ?? limit;
                if (foodTextCalls < lt) {
                  foodTextCalls += 1;
                  return Promise.resolve({ count: 1 });
                }
                return Promise.resolve({ count: 0 });
              },
            ),
            findUnique: jest.fn(() =>
              Promise.resolve({
                foodTextCalls,
                visionCalls: 0,
                adjustmentCalls: 0,
                coachCalls: 0,
                classifyCalls: 0,
                totalCalls: foodTextCalls,
              }),
            ),
          },
        }),
      ),
    };

    const entitlement = {
      usageDateKey: () => '2026-09-22',
      getCurrentPlan: () => Promise.resolve('FREE' as const),
      getDailyLimit: () => Promise.resolve(limit),
      fieldFor: () => 'foodTextCalls' as const,
      usedFor: () => foodTextCalls,
    };

    const service = new AiUsageService(
      prisma as never,
      entitlement as unknown as SubscriptionEntitlementService,
    );

    const results = await Promise.allSettled([
      service.consumeAiUsage('user-a', 'FOOD_TEXT'),
      service.consumeAiUsage('user-a', 'FOOD_TEXT'),
      service.consumeAiUsage('user-a', 'FOOD_TEXT'),
      service.consumeAiUsage('user-a', 'FOOD_TEXT'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(2);
    expect(foodTextCalls).toBe(2);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(AiQuotaExceededError);
    }
  });
});
