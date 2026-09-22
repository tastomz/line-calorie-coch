import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AdminSessionGuard } from './admin-session.guard';

describe('AdminSessionGuard', () => {
  const auth = {
    verifySession: jest.fn(),
  };
  const membershipAuth = {
    verifySession: jest.fn(),
  };
  const users = {
    isAdminUserId: jest.fn(),
  };

  const guard = new AdminSessionGuard(
    auth as never,
    membershipAuth as never,
    users as never,
  );

  function ctx(cookies: Record<string, string | undefined>) {
    const req: { cookies: typeof cookies; adminId?: string } = { cookies };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
      _req: req,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows env admin_session cookie', async () => {
    auth.verifySession.mockReturnValue('env-admin');
    const c = ctx({ admin_session: 'tok' });
    await expect(guard.canActivate(c as never)).resolves.toBe(true);
    expect(c._req.adminId).toBe('env-admin');
  });

  it('allows membership session when User.role=ADMIN', async () => {
    auth.verifySession.mockImplementation(() => {
      throw new Error('no admin cookie');
    });
    membershipAuth.verifySession.mockReturnValue('user-admin');
    users.isAdminUserId.mockResolvedValue(true);
    const c = ctx({ membership_session: 'mem' });
    await expect(guard.canActivate(c as never)).resolves.toBe(true);
    expect(c._req.adminId).toBe('user-admin');
  });

  it('returns 403 for authenticated USER without ADMIN role', async () => {
    membershipAuth.verifySession.mockReturnValue('user-normal');
    users.isAdminUserId.mockResolvedValue(false);
    const c = ctx({ membership_session: 'mem' });
    await expect(guard.canActivate(c as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns 401 when no session', async () => {
    const c = ctx({});
    await expect(guard.canActivate(c as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
