import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AdminSessionGuard } from './admin-session.guard';

describe('Admin AI usage authorization (guard)', () => {
  const auth = { verifySession: jest.fn() };
  const membershipAuth = { verifySession: jest.fn() };
  const users = { isAdminUserId: jest.fn() };
  const guard = new AdminSessionGuard(
    auth as never,
    membershipAuth as never,
    users as never,
  );

  function ctx(cookies: Record<string, string | undefined>) {
    const req: { cookies: typeof cookies; adminId?: string } = { cookies };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      _req: req,
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it('401 without session', async () => {
    await expect(guard.canActivate(ctx({}) as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('403 for authenticated USER', async () => {
    membershipAuth.verifySession.mockReturnValue('user-normal');
    users.isAdminUserId.mockResolvedValue(false);
    await expect(
      guard.canActivate(ctx({ membership_session: 'tok' }) as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows ADMIN membership session', async () => {
    membershipAuth.verifySession.mockReturnValue('admin-user');
    users.isAdminUserId.mockResolvedValue(true);
    await expect(
      guard.canActivate(ctx({ membership_session: 'tok' }) as never),
    ).resolves.toBe(true);
  });
});
