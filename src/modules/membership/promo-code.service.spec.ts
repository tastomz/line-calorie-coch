import { PaymentProvider, Plan, SubscriptionStatus } from '@prisma/client';
import { PromoRedeemError } from './membership.errors';
import { PromoCodeService } from './promo-code.service';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';

describe('PromoCodeService', () => {
  const findUniquePromo = jest.fn();
  const findUniqueRedemption = jest.fn();
  const updateMany = jest.fn();
  const createRedemption = jest.fn();
  const createSubscription = jest.fn();

  const prisma = {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        promoCode: {
          findUnique: findUniquePromo,
          updateMany,
        },
        promoRedemption: {
          findUnique: findUniqueRedemption,
          create: createRedemption,
        },
        subscription: { create: createSubscription },
      }),
    ),
  };

  const entitlement = {
    getLatestSubscription: jest.fn().mockResolvedValue(null),
    resolveEntitlement: jest.fn().mockReturnValue({
      plan: 'FREE',
      status: 'NONE',
      hasProAccess: false,
      subscription: null,
      periodEnd: null,
    }),
    isPaidActivePro: jest.fn().mockReturnValue(false),
  };

  const service = new PromoCodeService(
    prisma as never,
    entitlement as unknown as SubscriptionEntitlementService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    entitlement.getLatestSubscription.mockResolvedValue(null);
    entitlement.resolveEntitlement.mockReturnValue({
      plan: 'FREE',
      status: 'NONE',
      hasProAccess: false,
      subscription: null,
      periodEnd: null,
    });
    entitlement.isPaidActivePro.mockReturnValue(false);
    findUniquePromo.mockResolvedValue({
      id: 'promo-1',
      code: 'WELCOME30',
      trialDays: 30,
      maxRedemptions: 100,
      redeemedCount: 1,
      expiresAt: null,
      active: true,
    });
    findUniqueRedemption.mockResolvedValue(null);
    updateMany.mockResolvedValue({ count: 1 });
    createRedemption.mockResolvedValue({});
    createSubscription.mockResolvedValue({});
  });

  it('normalizes codes case-insensitively', () => {
    expect(service.normalizeCode('  welcome30 ')).toBe('WELCOME30');
  });

  it('redeems a valid promo into TRIALING PRO', async () => {
    const result = await service.redeem('user-a', 'welcome30');
    expect(result.code).toBe('WELCOME30');
    expect(result.trialDays).toBe(30);
    const calls = createSubscription.mock.calls as unknown as [
      {
        data: {
          userId: string;
          plan: Plan;
          status: SubscriptionStatus;
          provider: PaymentProvider;
        };
      },
    ][];
    expect(calls[0][0].data.userId).toBe('user-a');
    expect(calls[0][0].data.plan).toBe(Plan.PRO);
    expect(calls[0][0].data.status).toBe(SubscriptionStatus.TRIALING);
    expect(calls[0][0].data.provider).toBe(PaymentProvider.NONE);
  });

  it('rejects invalid code', async () => {
    findUniquePromo.mockResolvedValue(null);
    await expect(service.redeem('user-a', 'NOPE')).rejects.toMatchObject({
      code: 'invalid',
    });
  });

  it('rejects inactive code', async () => {
    findUniquePromo.mockResolvedValue({
      id: 'promo-1',
      code: 'WELCOME30',
      trialDays: 30,
      maxRedemptions: null,
      redeemedCount: 0,
      expiresAt: null,
      active: false,
    });
    await expect(service.redeem('user-a', 'WELCOME30')).rejects.toMatchObject({
      code: 'inactive',
    });
  });

  it('rejects expired code', async () => {
    findUniquePromo.mockResolvedValue({
      id: 'promo-1',
      code: 'WELCOME30',
      trialDays: 30,
      maxRedemptions: null,
      redeemedCount: 0,
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      active: true,
    });
    await expect(service.redeem('user-a', 'WELCOME30')).rejects.toMatchObject({
      code: 'expired',
    });
  });

  it('rejects already redeemed for same user', async () => {
    findUniqueRedemption.mockResolvedValue({ id: 'r1' });
    await expect(service.redeem('user-a', 'WELCOME30')).rejects.toMatchObject({
      code: 'already_redeemed',
    });
  });

  it('rejects when max redemptions reached', async () => {
    findUniquePromo.mockResolvedValue({
      id: 'promo-1',
      code: 'WELCOME30',
      trialDays: 30,
      maxRedemptions: 10,
      redeemedCount: 10,
      expiresAt: null,
      active: true,
    });
    await expect(service.redeem('user-a', 'WELCOME30')).rejects.toBeInstanceOf(
      PromoRedeemError,
    );
  });

  it('does not redeem over paid PRO', async () => {
    entitlement.resolveEntitlement.mockReturnValue({
      plan: 'PRO',
      status: SubscriptionStatus.ACTIVE,
      hasProAccess: true,
      subscription: {},
      periodEnd: new Date(),
    });
    entitlement.isPaidActivePro.mockReturnValue(true);
    await expect(service.redeem('user-a', 'WELCOME30')).rejects.toMatchObject({
      code: 'already_pro',
    });
  });

  it('does not stack over active trial', async () => {
    entitlement.resolveEntitlement.mockReturnValue({
      plan: 'PRO',
      status: SubscriptionStatus.TRIALING,
      hasProAccess: true,
      subscription: {},
      periodEnd: new Date(),
    });
    await expect(service.redeem('user-a', 'WELCOME30')).rejects.toMatchObject({
      code: 'trial_active',
    });
  });
});
