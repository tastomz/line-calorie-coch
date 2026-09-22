import { MockPaymentProvider } from './mock.payment-provider';
import { PRO_MONTHLY_PRICE_THB } from './plan.config';

describe('MockPaymentProvider', () => {
  const config = {
    get: () => 'http://localhost:3000',
  };
  const provider = new MockPaymentProvider(config as never);

  it('creates mock checkout URL and simulates success event', async () => {
    const session = await provider.createCheckoutSession({
      userId: 'user-a',
      successUrl: 'http://localhost/success',
      cancelUrl: 'http://localhost/cancel',
      priceThbMonthly: PRO_MONTHLY_PRICE_THB,
    });
    expect(session.url).toContain('/membership/mock-checkout?session_id=');
    const event = provider.simulatePaymentSuccess(session.sessionId);
    expect(event.type).toBe('checkout_completed');
    expect(
      (event.data as { client_reference_id: string }).client_reference_id,
    ).toBe('user-a');
  });
});
