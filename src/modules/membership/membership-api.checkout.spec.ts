import { HttpException, HttpStatus } from '@nestjs/common';
import { MembershipApiController } from './membership-api.controller';
import { membershipRateLimiter } from './membership-rate-limiter';

describe('MembershipApiController checkout gate', () => {
  beforeEach(() => {
    membershipRateLimiter.reset();
  });

  function build(opts: { checkoutFlag?: string; paymentConfigured?: boolean }) {
    const config = {
      get: (k: string) => {
        if (k === 'ENABLE_MEMBERSHIP_CHECKOUT') return opts.checkoutFlag ?? '';
        if (k === 'PAYMENT_MODE') return 'MOCK';
        if (k === 'NODE_ENV') return 'test';
        return '';
      },
    };
    const billing = {
      paymentConfigured: jest
        .fn()
        .mockReturnValue(opts.paymentConfigured ?? true),
      createCheckout: jest.fn().mockResolvedValue({ url: 'http://pay.test' }),
      cancel: jest.fn(),
      resume: jest.fn(),
      handleVerifiedWebhook: jest.fn(),
    };
    const controller = new MembershipApiController(
      {} as never,
      {} as never,
      billing as never,
      {} as never,
      {} as never,
      {} as never,
      config as never,
      {} as never,
    );
    return { controller, billing };
  }

  it('rejects checkout when ENABLE_MEMBERSHIP_CHECKOUT is not true', async () => {
    const { controller, billing } = build({
      checkoutFlag: 'false',
      paymentConfigured: true,
    });
    await expect(controller.checkout('user-a')).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
    });
    expect(billing.createCheckout).not.toHaveBeenCalled();
  });

  it('rejects checkout when payment is not configured even if flag is on', async () => {
    const { controller, billing } = build({
      checkoutFlag: 'true',
      paymentConfigured: false,
    });
    await expect(controller.checkout('user-a')).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(billing.createCheckout).not.toHaveBeenCalled();
  });

  it('allows checkout when flag is true and payment configured', async () => {
    const { controller, billing } = build({
      checkoutFlag: 'true',
      paymentConfigured: true,
    });
    await expect(controller.checkout('user-a')).resolves.toEqual({
      url: 'http://pay.test',
    });
    expect(billing.createCheckout).toHaveBeenCalledWith('user-a');
  });

  it('exposes checkoutEnabled=false in public config by default', () => {
    const { controller } = build({ checkoutFlag: '' });
    const cfg = controller.publicConfig();
    expect(cfg.checkoutEnabled).toBe(false);
    expect(cfg.loginPath).toBe('/login');
    expect(cfg.accountPath).toBe('/account');
    expect(cfg.profilePath).toBe('/profile');
  });
});
