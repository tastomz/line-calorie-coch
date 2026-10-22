import {
  PaymentProvider,
  Plan,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { MembershipBillingService } from './membership-billing.service';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';

const DAY = 24 * 60 * 60 * 1000;

function paidSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_test_123456789',
    mode: 'payment',
    payment_status: 'paid',
    currency: 'thb',
    amount_total: 5000,
    customer: 'cus_1',
    client_reference_id: 'user-1',
    metadata: {
      internalUserId: 'user-1',
      kind: 'pro_pass',
      planCode: '1m',
      priceThb: '50',
      passDays: '30',
    },
    ...overrides,
  };
}

describe('MembershipBillingService PromptPay pass', () => {
  type CreatedSub = {
    data: Record<string, unknown> & { currentPeriodEnd: Date };
  };
  type CreatedEvent = { data: { providerEventId: string } };
  const tx = {
    paymentEvent: { create: jest.fn<Promise<unknown>, [CreatedEvent]>() },
    subscription: {
      findFirst: jest.fn<Promise<unknown>, []>(),
      create: jest.fn<Promise<unknown>, [CreatedSub]>(),
    },
  };
  const prisma = {
    paymentEvent: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const entitlement = new SubscriptionEntitlementService({} as never);
  const payments = { isConfigured: () => true, getSubscription: jest.fn() };
  const service = new MembershipBillingService(
    prisma as never,
    { get: () => 'http://localhost:3000' } as never,
    entitlement,
    {} as never,
    payments as never,
  );

  const event = (data: unknown, id = 'evt_1') =>
    service.handleVerifiedWebhook({
      type: 'checkout_completed',
      data,
      providerEventId: id,
      stripeType: 'checkout.session.completed',
    });

  beforeEach(() => {
    jest.clearAllMocks();
    tx.paymentEvent.create.mockResolvedValue({});
    tx.subscription.findFirst.mockResolvedValue(null);
    tx.subscription.create.mockResolvedValue({});
  });

  it('grants 30 days of PRO from now for a FREE user', async () => {
    const before = Date.now();
    await event(paidSession());
    expect(tx.subscription.create).toHaveBeenCalledTimes(1);
    const data = tx.subscription.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      userId: 'user-1',
      plan: Plan.PRO,
      status: SubscriptionStatus.ACTIVE,
      provider: PaymentProvider.STRIPE,
      providerCustomerId: 'cus_1',
    });
    expect(data.providerSubscriptionId).toBeUndefined();
    const end = data.currentPeriodEnd.getTime();
    expect(end).toBeGreaterThanOrEqual(before + 30 * DAY);
    expect(end).toBeLessThan(before + 30 * DAY + 5000);
    expect(tx.paymentEvent.create.mock.calls[0][0].data.providerEventId).toBe(
      'pass:cs_test_123456789',
    );
  });

  it('stacks on top of remaining PRO (renew early)', async () => {
    const currentEnd = new Date(Date.now() + 10 * DAY);
    tx.subscription.findFirst.mockResolvedValue({
      plan: Plan.PRO,
      status: SubscriptionStatus.ACTIVE,
      provider: PaymentProvider.STRIPE,
      currentPeriodEnd: currentEnd,
    });
    await event(paidSession());
    const data = tx.subscription.create.mock.calls[0][0].data;
    expect(data.currentPeriodEnd.getTime()).toBe(
      currentEnd.getTime() + 30 * DAY,
    );
  });

  it('stacks on top of a promo trial', async () => {
    const trialEnd = new Date(Date.now() + 3 * DAY);
    tx.subscription.findFirst.mockResolvedValue({
      plan: Plan.PRO,
      status: SubscriptionStatus.TRIALING,
      provider: PaymentProvider.NONE,
      trialEndsAt: trialEnd,
      currentPeriodEnd: trialEnd,
    });
    await event(paidSession());
    const data = tx.subscription.create.mock.calls[0][0].data;
    expect(data.currentPeriodEnd.getTime()).toBe(trialEnd.getTime() + 30 * DAY);
  });

  it('grants only once per session (completed + async_payment_succeeded)', async () => {
    await event(paidSession(), 'evt_completed');
    tx.paymentEvent.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(event(paidSession(), 'evt_async')).resolves.toBe('processed');
    expect(tx.subscription.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unpaid QR', { payment_status: 'unpaid' }],
    ['wrong amount', { amount_total: 100 }],
    ['wrong currency', { currency: 'usd' }],
    ['not a pass', { metadata: { internalUserId: 'user-1' } }],
    [
      'amount differs from the priced metadata',
      {
        metadata: {
          internalUserId: 'user-1',
          kind: 'pro_pass',
          priceThb: '600',
          passDays: '365',
        },
      },
    ],
  ])('does not grant for %s', async (_label, overrides) => {
    await event(paidSession(overrides));
    expect(tx.subscription.create).not.toHaveBeenCalled();
  });

  it('grants the days of a discounted 12-month plan', async () => {
    const before = Date.now();
    await event(
      paidSession({
        amount_total: 54000,
        metadata: {
          internalUserId: 'user-1',
          kind: 'pro_pass',
          planCode: '12m',
          priceThb: '540',
          passDays: '365',
        },
      }),
    );
    const data = tx.subscription.create.mock.calls[0][0].data;
    const end = data.currentPeriodEnd.getTime();
    expect(end).toBeGreaterThanOrEqual(before + 365 * DAY);
    expect(end).toBeLessThan(before + 365 * DAY + 5000);
  });
});
