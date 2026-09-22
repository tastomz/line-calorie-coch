import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  MEMBERSHIP_SESSION_COOKIE,
  MembershipAuthService,
} from './membership-auth.service';

@Injectable()
export class MembershipSessionGuard implements CanActivate {
  constructor(private readonly auth: MembershipAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { membershipUserId?: string }>();
    const cookie = req.cookies?.[MEMBERSHIP_SESSION_COOKIE] as
      string | undefined;
    const userId = this.auth.verifySession(cookie);
    req.membershipUserId = userId;
    return true;
  }
}

export const MembershipUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{ membershipUserId?: string }>();
    if (!req.membershipUserId) {
      throw new UnauthorizedException('กรุณาเข้าสู่ระบบ');
    }
    return req.membershipUserId;
  },
);
