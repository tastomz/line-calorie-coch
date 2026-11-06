import { PaymentProvider, Prisma } from '@prisma/client';
import { MembershipBillingService } from './membership-billing.service';

describe('MembershipBillingService webhook idempotency', () => {
  const create = jest.fn();
  const subscription = {
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  const tx = { paymentEvent: { create }, subscription };
  const prisma = {
    paymentEvent: { create, findUnique: jest.fn() },
    $transaction: jest.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
    subscription,
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
    {} as never,
    payments as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.paymentEvent.findUnique.mockResolvedValue(null);
    prisma.subscription.findFirst.mockResolvedValue(null);
    prisma.subscription.create.mockResolvedValue({});
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
    prisma.paymentEvent.findUnique.mockResolvedValue({ id: 'paid-event' });
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

  it('returns a retryable error when Stripe cannot confirm a subscription', async () => {
    create.mockResolvedValue({});
    payments.getSubscription.mockResolvedValue(null);
    await expect(
      service.handleVerifiedWebhook({
        type: 'checkout_completed',
        data: {
          mode: 'subscription',
          client_reference_id: 'user-a',
          subscription: 'sub_not_available',
        },
        providerEventId: 'evt_unavailable',
        stripeType: 'checkout.session.completed',
      }),
    ).rejects.toThrow('Stripe subscription snapshot unavailable');
    expect(prisma.subscription.create).not.toHaveBeenCalled();
  });

  it('does not swallow an unrelated subscription unique collision', async () => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique subscription failure', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.handleVerifiedWebhook({
        type: 'invoice_paid',
        data: {},
        providerEventId: 'evt_new',
        stripeType: 'invoice.paid',
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('retries a checkout when the provider snapshot becomes available', async () => {
    create.mockResolvedValue({});
    payments.getSubscription
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        providerSubscriptionId: 'sub_1',
        providerCustomerId: 'cus_1',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
        cancelAtPeriodEnd: false,
      });
    const params = {
      type: 'checkout_completed' as const,
      data: {
        mode: 'subscription',
        client_reference_id: 'user-a',
        subscription: 'sub_1',
      },
      providerEventId: 'evt_retry',
      stripeType: 'checkout.session.completed',
    };
    await expect(service.handleVerifiedWebhook(params)).rejects.toThrow(
      'Stripe subscription snapshot unavailable',
    );
    await expect(service.handleVerifiedWebhook(params)).resolves.toBe(
      'processed',
    );
    expect(create).toHaveBeenCalledTimes(2);
    expect(prisma.subscription.create).toHaveBeenCalledTimes(1);
  });
});
