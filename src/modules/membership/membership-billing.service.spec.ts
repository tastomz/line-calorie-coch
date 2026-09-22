import { PaymentProvider, Prisma } from '@prisma/client';
import { MembershipBillingService } from './membership-billing.service';

describe('MembershipBillingService webhook idempotency', () => {
  const create = jest.fn();
  const prisma = {
    paymentEvent: { create },
    $transaction: jest.fn(),
    subscription: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };
  const entitlement = {
    getLatestSubscription: jest.fn(),
    resolveEntitlement: jest.fn(),
    isPaidActivePro: jest.fn(),
  };
  const payments = {
    isConfigured: () => true,
    getSubscription: jest.fn(),
    createCheckoutSession: jest.fn(),
    cancelSubscription: jest.fn(),
    resumeSubscription: jest.fn(),
    verifyAndParseWebhook: jest.fn(),
  };
  const config = { get: () => 'http://localhost:3000' };

  const service = new MembershipBillingService(
    prisma as never,
    config as never,
    entitlement as never,
    payments as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records payment event and ignores unknown types safely', async () => {
    create.mockResolvedValue({});
    await expect(
      service.handleVerifiedWebhook({
        type: 'ignored',
        data: {},
        providerEventId: 'evt_1',
        stripeType: 'ping',
      }),
    ).resolves.toBe('ignored');
    expect(create).toHaveBeenCalledTimes(1);
    const calls = create.mock.calls as unknown as [
      { data: { provider: PaymentProvider; providerEventId: string } },
    ][];
    expect(calls[0][0].data.provider).toBe(PaymentProvider.STRIPE);
    expect(calls[0][0].data.providerEventId).toBe('evt_1');
  });

  it('returns duplicate when providerEventId already stored', async () => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.handleVerifiedWebhook({
        type: 'checkout_completed',
        data: {},
        providerEventId: 'evt_dup',
        stripeType: 'checkout.session.completed',
      }),
    ).resolves.toBe('duplicate');
  });
});
