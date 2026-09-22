import { MembershipService } from './membership.service';
import { PromoCodeService } from './promo-code.service';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';

describe('Membership user isolation', () => {
  const config = { get: jest.fn().mockReturnValue('') };
  const auth = { createMembershipLink: jest.fn() };
  const billing = { paymentConfigured: jest.fn().mockReturnValue(false) };

  it('status uses only the authenticated userId argument', async () => {
    const entitlement = {
      getEntitlement: jest.fn().mockResolvedValue({
        plan: 'FREE',
        status: 'NONE',
        hasProAccess: false,
        subscription: null,
        periodEnd: null,
      }),
      getDailyUsage: jest.fn().mockResolvedValue({
        usageDate: '2026-09-22',
        foodTextCalls: 0,
        visionCalls: 0,
        adjustmentCalls: 0,
        coachCalls: 0,
        classifyCalls: 0,
        bodyScanCalls: 0,
        mealPlanCalls: 0,
        weeklyReviewCalls: 0,
        totalCalls: 0,
      }),
    };
    const promo = { redeem: jest.fn() };
    const service = new MembershipService(
      entitlement as unknown as SubscriptionEntitlementService,
      promo as unknown as PromoCodeService,
      auth as never,
      billing as never,
      config as never,
    );

    await service.buildStatusText('user-a');
    expect(entitlement.getEntitlement).toHaveBeenCalledWith('user-a');
    expect(entitlement.getDailyUsage).toHaveBeenCalledWith('user-a');
    expect(entitlement.getEntitlement).not.toHaveBeenCalledWith('user-b');
  });

  it('promo redeem binds to authenticated userId only', async () => {
    const entitlement = {
      getEntitlement: jest.fn(),
      getDailyUsage: jest.fn(),
    };
    const promo = {
      redeem: jest.fn().mockResolvedValue({
        code: 'WELCOME30',
        trialDays: 30,
        expiresAt: new Date('2026-10-22T00:00:00.000Z'),
      }),
    };
    const service = new MembershipService(
      entitlement as unknown as SubscriptionEntitlementService,
      promo as unknown as PromoCodeService,
      auth as never,
      billing as never,
      config as never,
    );

    await service.redeemPromo('user-a', 'WELCOME30');
    expect(promo.redeem).toHaveBeenCalledWith('user-a', 'WELCOME30');
    expect(promo.redeem).not.toHaveBeenCalledWith('user-b', expect.anything());
  });

  it('usage queries are scoped by userId', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = {
      subscription: { findFirst },
      aIUsage: { findUnique },
    };
    const service = new SubscriptionEntitlementService(prisma as never);

    await service.getDailyUsage('user-a');
    const usageCalls = findUnique.mock.calls as unknown as [
      {
        where: { userId_usageDate: { userId: string; usageDate: string } };
      },
    ][];
    expect(usageCalls[0][0].where.userId_usageDate.userId).toBe('user-a');
    expect(usageCalls[0][0].where.userId_usageDate.usageDate).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );

    await service.getEntitlement('user-b');
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-b' },
      orderBy: { updatedAt: 'desc' },
    });
  });
});
