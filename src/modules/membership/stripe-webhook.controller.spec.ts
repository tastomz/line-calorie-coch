import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { StripeWebhookController } from './stripe-webhook.controller';

describe('StripeWebhookController', () => {
  const billing = { handleVerifiedWebhook: jest.fn() };
  const payments = { verifyAndParseWebhook: jest.fn() };
  const controller = new StripeWebhookController(
    billing as never,
    payments as never,
  );
  const rawBody = Buffer.from('signed-payload');
  const parsed = {
    type: 'checkout_completed',
    data: {},
    providerEventId: 'evt_verified',
    stripeType: 'checkout.session.completed',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    payments.verifyAndParseWebhook.mockResolvedValue(parsed);
    billing.handleVerifiedWebhook.mockResolvedValue('processed');
  });

  it('rejects missing raw body before contacting Stripe', async () => {
    await expect(
      controller.handleStripe({} as never, 'signature'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(payments.verifyAndParseWebhook).not.toHaveBeenCalled();
  });

  it('rejects invalid Stripe signatures with 401', async () => {
    payments.verifyAndParseWebhook.mockRejectedValue(
      new Error('signature verification failed'),
    );
    await expect(
      controller.handleStripe({ rawBody } as never, 'bad-signature'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(billing.handleVerifiedWebhook).not.toHaveBeenCalled();
  });

  it('returns a retryable server error when verified payment processing fails', async () => {
    billing.handleVerifiedWebhook.mockRejectedValue(
      new Error('database transaction rolled back'),
    );
    await expect(
      controller.handleStripe({ rawBody } as never, 'valid-signature'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(payments.verifyAndParseWebhook).toHaveBeenCalledWith(
      rawBody,
      'valid-signature',
    );
    expect(billing.handleVerifiedWebhook).toHaveBeenCalledWith(parsed);
  });

  it('acknowledges successfully committed webhook processing', async () => {
    await expect(
      controller.handleStripe({ rawBody } as never, 'valid-signature'),
    ).resolves.toEqual({ received: true, result: 'processed' });
  });
});
