import { StripePaymentProvider } from './stripe.payment-provider';

describe('StripePaymentProvider checkout customer', () => {
  function provider(retrieve: jest.Mock) {
    const config = {
      get: (k: string) =>
        ({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' })[
          k
        ],
    };
    const p = new StripePaymentProvider(config as never);
    const create = jest
      .fn()
      .mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/x' });
    const customersCreate = jest.fn().mockResolvedValue({ id: 'cus_new' });
    Object.assign(p as unknown as Record<string, unknown>, {
      client: {
        customers: { retrieve, create: customersCreate },
        checkout: { sessions: { create } },
      },
    });
    return { p, create, customersCreate };
  }
  const req = {
    userId: 'u1',
    planCode: '1m',
    planLabelTh: '1 เดือน',
    priceThb: 60,
    passDays: 30,
    successUrl: 'https://x/s',
    cancelUrl: 'https://x/c',
  };

  it('creates a new customer when the stored one is from the other mode', async () => {
    const retrieve = jest.fn().mockRejectedValue(
      Object.assign(new Error('No such customer'), {
        code: 'resource_missing',
      }),
    );
    const { p, create, customersCreate } = provider(retrieve);
    const r = await p.createCheckoutSession({
      ...req,
      providerCustomerId: 'cus_test_old',
    });
    expect(customersCreate).toHaveBeenCalled();
    expect((create.mock.calls as unknown[][])[0][0]).toMatchObject({
      customer: 'cus_new',
    });
    expect(r.customerId).toBe('cus_new');
  });

  it('reuses a stored customer that exists', async () => {
    const retrieve = jest.fn().mockResolvedValue({ id: 'cus_ok' });
    const { p, create, customersCreate } = provider(retrieve);
    await p.createCheckoutSession({ ...req, providerCustomerId: 'cus_ok' });
    expect(customersCreate).not.toHaveBeenCalled();
    expect((create.mock.calls as unknown[][])[0][0]).toMatchObject({
      customer: 'cus_ok',
    });
  });
});
