import { BadRequestException } from '@nestjs/common';
import { AuthLiffController } from './auth-liff.controller';
import { MEMBERSHIP_SESSION_COOKIE } from './membership-auth.service';
import { membershipRateLimiter } from './membership-rate-limiter';

describe('AuthLiffController', () => {
  beforeEach(() => {
    membershipRateLimiter.reset();
  });

  it('exchanges verified idToken for membership_session cookie', async () => {
    const auth = {
      verifyLineIdToken: jest.fn().mockResolvedValue('user-a'),
      signSession: jest.fn().mockReturnValue('signed.session'),
    };
    const config = { get: () => 'test' };
    const controller = new AuthLiffController(auth as never, config as never);
    const res = { cookie: jest.fn() };

    await expect(
      controller.authLiff({ idToken: 'line-id-token' }, res as never),
    ).resolves.toEqual({ ok: true });

    expect(auth.verifyLineIdToken).toHaveBeenCalledWith('line-id-token');
    expect(auth.signSession).toHaveBeenCalledWith('user-a');
    expect(res.cookie).toHaveBeenCalledWith(
      MEMBERSHIP_SESSION_COOKIE,
      'signed.session',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
  });

  it('rejects missing idToken', async () => {
    const controller = new AuthLiffController(
      {} as never,
      { get: () => '' } as never,
    );
    await expect(
      controller.authLiff({}, { cookie: jest.fn() } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
