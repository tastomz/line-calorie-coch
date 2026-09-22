import { Plan, PaymentProvider, SubscriptionStatus } from '@prisma/client';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';

describe('SubscriptionEntitlementService.resolveEntitlement', () => {
  const service = new SubscriptionEntitlementService({} as never);
  const now = new Date('2026-09-22T12:00:00.000Z');

  it('defaults to FREE when no subscription row', () => {
    const ent = service.resolveEntitlement(null, now);
    expect(ent.plan).toBe('FREE');
    expect(ent.hasProAccess).toBe(false);
    expect(ent.status).toBe('NONE');
  });

  it('TRIALING with future trialEndsAt has PRO access', () => {
    const ent = service.resolveEntitlement(
      {
        id: 's1',
        userId: 'u1',
        plan: Plan.PRO,
        status: SubscriptionStatus.TRIALING,
        provider: PaymentProvider.NONE,
        providerCustomerId: null,
        providerSubscriptionId: null,
        trialStartedAt: now,
        trialEndsAt: new Date('2026-10-22T12:00:00.000Z'),
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: new Date('2026-10-22T12:00:00.000Z'),
        canceledAt: null,
        createdAt: now,
        updatedAt: now,
      },
      now,
    );
    expect(ent.hasProAccess).toBe(true);
    expect(ent.plan).toBe('PRO');
    expect(ent.status).toBe(SubscriptionStatus.TRIALING);
  });

  it('expired trial becomes effectively FREE', () => {
    const ent = service.resolveEntitlement(
      {
        id: 's1',
        userId: 'u1',
        plan: Plan.PRO,
        status: SubscriptionStatus.TRIALING,
        provider: PaymentProvider.NONE,
        providerCustomerId: null,
        providerSubscriptionId: null,
        trialStartedAt: new Date('2026-08-01T00:00:00.000Z'),
        trialEndsAt: new Date('2026-08-31T00:00:00.000Z'),
        startedAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        canceledAt: null,
        createdAt: now,
        updatedAt: now,
      },
      now,
    );
    expect(ent.hasProAccess).toBe(false);
    expect(ent.plan).toBe('FREE');
  });

  it('ACTIVE paid PRO works until period end', () => {
    const ent = service.resolveEntitlement(
      {
        id: 's1',
        userId: 'u1',
        plan: Plan.PRO,
        status: SubscriptionStatus.ACTIVE,
        provider: PaymentProvider.STRIPE,
        providerCustomerId: 'cus_x',
        providerSubscriptionId: 'sub_x',
        trialStartedAt: null,
        trialEndsAt: null,
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: new Date('2026-10-22T12:00:00.000Z'),
        canceledAt: null,
        createdAt: now,
        updatedAt: now,
      },
      now,
    );
    expect(ent.hasProAccess).toBe(true);
    expect(ent.plan).toBe('PRO');
  });

  it('CANCELED retains PRO until currentPeriodEnd', () => {
    const ent = service.resolveEntitlement(
      {
        id: 's1',
        userId: 'u1',
        plan: Plan.PRO,
        status: SubscriptionStatus.CANCELED,
        provider: PaymentProvider.STRIPE,
        providerCustomerId: 'cus_x',
        providerSubscriptionId: 'sub_x',
        trialStartedAt: null,
        trialEndsAt: null,
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
        canceledAt: now,
        createdAt: now,
        updatedAt: now,
      },
      now,
    );
    expect(ent.hasProAccess).toBe(true);
    expect(ent.plan).toBe('PRO');
  });

  it('CANCELED becomes FREE after period end', () => {
    const ent = service.resolveEntitlement(
      {
        id: 's1',
        userId: 'u1',
        plan: Plan.PRO,
        status: SubscriptionStatus.CANCELED,
        provider: PaymentProvider.STRIPE,
        providerCustomerId: 'cus_x',
        providerSubscriptionId: 'sub_x',
        trialStartedAt: null,
        trialEndsAt: null,
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
        canceledAt: now,
        createdAt: now,
        updatedAt: now,
      },
      now,
    );
    expect(ent.hasProAccess).toBe(false);
    expect(ent.plan).toBe('FREE');
  });

  it('PAST_DUE does not grant Pro access', () => {
    const ent = service.resolveEntitlement(
      {
        id: 's1',
        userId: 'u1',
        plan: Plan.PRO,
        status: SubscriptionStatus.PAST_DUE,
        provider: PaymentProvider.STRIPE,
        providerCustomerId: 'cus_x',
        providerSubscriptionId: 'sub_x',
        trialStartedAt: null,
        trialEndsAt: null,
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
        canceledAt: null,
        createdAt: now,
        updatedAt: now,
      },
      now,
    );
    expect(ent.hasProAccess).toBe(false);
    expect(ent.status).toBe(SubscriptionStatus.PAST_DUE);
  });

  it('reports remaining quota correctly', async () => {
    const prisma = {
      subscription: { findFirst: jest.fn().mockResolvedValue(null) },
      aIUsage: {
        findUnique: jest.fn().mockResolvedValue({
          foodTextCalls: 3,
          visionCalls: 0,
          adjustmentCalls: 0,
          coachCalls: 0,
          classifyCalls: 0,
          totalCalls: 3,
        }),
      },
    };
    const svc = new SubscriptionEntitlementService(prisma as never);
    await expect(svc.getRemainingQuota('user-a', 'FOOD_TEXT')).resolves.toBe(2);
    await expect(svc.canUseAi('user-a', 'FOOD_TEXT')).resolves.toBe(true);
    await expect(svc.canUseAi('user-a', 'FOOD_VISION')).resolves.toBe(true);
  });

  it('usage snapshot defaults to zeros on a fresh date', async () => {
    const prisma = {
      subscription: { findFirst: jest.fn() },
      aIUsage: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const svc = new SubscriptionEntitlementService(prisma as never);
    const usage = await svc.getDailyUsage('user-a');
    expect(usage.foodTextCalls).toBe(0);
    expect(usage.totalCalls).toBe(0);
  });
});
