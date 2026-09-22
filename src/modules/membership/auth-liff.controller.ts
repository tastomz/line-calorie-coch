import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import {
  MEMBERSHIP_SESSION_COOKIE,
  MembershipAuthService,
} from './membership-auth.service';
import { membershipRateLimiter } from './membership-rate-limiter';

/**
 * LIFF / LINE Login → existing membership_session cookie.
 * POST /auth/liff { idToken } — identity from LINE verify only (never client userId).
 */
@Controller('auth')
export class AuthLiffController {
  constructor(
    private readonly auth: MembershipAuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('liff')
  async authLiff(
    @Body() body: { idToken?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!membershipRateLimiter.tryConsume('liff', 'membership_login')) {
      throw new HttpException(
        'Too many attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const idToken = (body.idToken ?? '').trim();
    if (!idToken) {
      throw new BadRequestException('idToken required');
    }
    const userId = await this.auth.verifyLineIdToken(idToken);
    const token = this.auth.signSession(userId);
    const secure = (this.config.get<string>('NODE_ENV') ?? '') === 'production';
    res.cookie(MEMBERSHIP_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { ok: true };
  }
}
