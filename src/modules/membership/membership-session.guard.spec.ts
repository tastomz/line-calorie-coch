import { UnauthorizedException } from '@nestjs/common';
import { MembershipSessionGuard } from './membership-session.guard';
import { MembershipAuthService } from './membership-auth.service';

describe('MembershipSessionGuard', () => {
  it('sets membershipUserId from verified session cookie', () => {
    const auth = {
      verifySession: jest.fn().mockReturnValue('user-a'),
    };
    const guard = new MembershipSessionGuard(
      auth as unknown as MembershipAuthService,
    );
    const req: { cookies: Record<string, string>; membershipUserId?: string } =
      {
        cookies: { membership_session: 'tok' },
      };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    };
    expect(guard.canActivate(ctx as never)).toBe(true);
    expect(req.membershipUserId).toBe('user-a');
    expect(auth.verifySession).toHaveBeenCalledWith('tok');
  });

  it('propagates 401 when session missing/invalid', () => {
    const auth = {
      verifySession: jest.fn().mockImplementation(() => {
        throw new UnauthorizedException('กรุณาเข้าสู่ระบบ');
      }),
    };
    const guard = new MembershipSessionGuard(
      auth as unknown as MembershipAuthService,
    );
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ cookies: {} }),
      }),
    };
    expect(() => guard.canActivate(ctx as never)).toThrow(
      UnauthorizedException,
    );
  });
});
