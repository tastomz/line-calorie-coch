import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  MEMBERSHIP_SESSION_COOKIE,
  MembershipAuthService,
} from '../membership/membership-auth.service';
import { UsersService } from '../users/users.service';
import { ADMIN_SESSION_COOKIE, AdminAuthService } from './admin-auth.service';

/**
 * Admin authorization:
 * 1) Env-based admin_session cookie (bootstrap operators), OR
 * 2) Membership session for a User with role=ADMIN
 *
 * USER / PRO USER without ADMIN role → 403 if they have a membership session,
 * otherwise 401.
 */
@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly membershipAuth: MembershipAuthService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { adminId?: string }>();

    const adminCookie = req.cookies?.[ADMIN_SESSION_COOKIE] as
      string | undefined;
    if (adminCookie) {
      try {
        req.adminId = this.auth.verifySession(adminCookie);
        return true;
      } catch {
        // fall through
      }
    }

    const memCookie = req.cookies?.[MEMBERSHIP_SESSION_COOKIE] as
      string | undefined;
    if (memCookie) {
      try {
        const userId = this.membershipAuth.verifySession(memCookie);
        const isAdmin = await this.users.isAdminUserId(userId);
        if (!isAdmin) {
          throw new ForbiddenException('Admin role required');
        }
        req.adminId = userId;
        return true;
      } catch (error) {
        if (error instanceof ForbiddenException) throw error;
        throw new UnauthorizedException('Admin authentication required');
      }
    }

    throw new UnauthorizedException('Admin authentication required');
  }
}

export { AdminId } from './admin-session.decorator';
