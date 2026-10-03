import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionEntitlementService } from '../membership/subscription-entitlement.service';
import { AdminApiController } from './admin-api.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminAiUsageService } from './admin-ai-usage.service';
import { AdminDashboardService } from './admin-dashboard.service';

type CreateArg = {
  data: {
    code: string;
    description: string;
    trialDays: number;
    maxRedemptions: number;
    expiresAt: Date | null;
    active: boolean;
  };
};

describe('Admin free-PRO code generation (typed inputs)', () => {
  const create = jest.fn((arg: CreateArg) =>
    Promise.resolve({ id: 'promo-1', ...arg.data, redeemedCount: 0 }),
  );
  const prisma = { promoCode: { create } };
  const dashboard = new AdminDashboardService(
    prisma as unknown as PrismaService,
    {} as unknown as SubscriptionEntitlementService,
  );
  const auth = { audit: jest.fn().mockResolvedValue(undefined) };
  const controller = new AdminApiController(
    auth as unknown as AdminAuthService,
    dashboard,
    {} as unknown as AdminAiUsageService,
    {} as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('stores exactly the days and redemption limit the admin typed', async () => {
    const promo = await controller.generatePromo('admin-1', {
      trialDays: 7,
      maxRedemptions: 25,
    });

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.trialDays).toBe(7);
    expect(data.maxRedemptions).toBe(25);
    expect(data.code).toMatch(/^TASTOM-[A-Z0-9]{6}$/);
    expect(promo.trialDays).toBe(7);
    expect(auth.audit).toHaveBeenCalledWith(
      'admin-1',
      'promo_generate',
      'PromoCode',
      'promo-1',
      expect.objectContaining({ trialDays: 7, maxRedemptions: 25 }),
    );
  });

  it('keeps the old defaults when the fields are omitted', async () => {
    await controller.generatePromo('admin-1', {});
    const data = create.mock.calls[0][0].data;
    expect(data.trialDays).toBe(30);
    expect(data.maxRedemptions).toBe(1);
  });

  it.each([
    [{ trialDays: 0 }],
    [{ trialDays: 366 }],
    [{ trialDays: 7.5 }],
    [{ trialDays: '7' as unknown as number }],
    [{ maxRedemptions: 0 }],
    [{ maxRedemptions: 1001 }],
    [{ maxRedemptions: -3 }],
  ])('rejects %j with 400 and writes nothing', async (body) => {
    await expect(
      controller.generatePromo('admin-1', body),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.createPromo('admin-1', body),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
    expect(auth.audit).not.toHaveBeenCalled();
  });

  it('the service itself refuses invalid values (no bypass via other callers)', async () => {
    await expect(
      dashboard.generateFreeProCode({ trialDays: 9999, maxRedemptions: 1 }),
    ).rejects.toThrow('trialDays');
    await expect(
      dashboard.generateFreeProCode({ trialDays: 10, maxRedemptions: 0 }),
    ).rejects.toThrow('maxRedemptions');
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps a custom description when given, else describes the days', async () => {
    await controller.generatePromo('admin-1', { trialDays: 14 });
    expect(create.mock.calls[0][0].data.description).toBe('Free PRO 14 days');
    await controller.generatePromo('admin-1', {
      trialDays: 14,
      description: 'Campaign A',
    });
    expect(create.mock.calls[1][0].data.description).toBe('Campaign A');
  });
});
