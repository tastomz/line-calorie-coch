import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { isAllowedPromoDays } from '../membership/promo-code.generator';
import { membershipRateLimiter } from '../membership/membership-rate-limiter';
import { ADMIN_SESSION_COOKIE, AdminAuthService } from './admin-auth.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminId } from './admin-session.decorator';
import { AdminSessionGuard } from './admin-session.guard';

@Controller('admin/api')
export class AdminApiController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly dashboard: AdminDashboardService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  async login(
    @Body() body: { username?: string; password?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const username = (body.username ?? '').trim();
    const password = body.password ?? '';
    if (!membershipRateLimiter.tryConsume(username || 'anon', 'admin_login')) {
      throw new HttpException(
        'Too many attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (!this.auth.verifyCredentials(username, password)) {
      await this.auth.audit(username || 'unknown', 'login_failed');
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    const token = this.auth.signSession(username);
    const secure = (this.config.get<string>('NODE_ENV') ?? '') === 'production';
    res.cookie(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure,
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    });
    await this.auth.audit(username, 'login_success');
    return { ok: true };
  }

  @Post('logout')
  @UseGuards(AdminSessionGuard)
  async logout(
    @AdminId() adminId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' });
    await this.auth.audit(adminId, 'logout');
    return { ok: true };
  }

  @Get('dashboard')
  @UseGuards(AdminSessionGuard)
  dashboardData() {
    return this.dashboard.dashboard();
  }

  @Get('users')
  @UseGuards(AdminSessionGuard)
  users(@Query('q') q?: string) {
    return this.dashboard.searchUsers(q ?? '');
  }

  @Get('users/:id')
  @UseGuards(AdminSessionGuard)
  async user(@Param('id') id: string) {
    const detail = await this.dashboard.getUserDetail(id);
    if (!detail) {
      throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    }
    return detail;
  }

  @Get('promos')
  @UseGuards(AdminSessionGuard)
  promos() {
    return this.dashboard.listPromos();
  }

  @Post('promos/generate')
  @UseGuards(AdminSessionGuard)
  async generatePromo(
    @AdminId() adminId: string,
    @Body()
    body: {
      trialDays?: number;
      maxRedemptions?: number | null;
      description?: string;
      expiresAt?: string | null;
    },
  ) {
    const trialDays = body.trialDays ?? 30;
    if (!isAllowedPromoDays(trialDays)) {
      throw new BadRequestException('trialDays must be 10, 15, or 30');
    }
    try {
      const promo = await this.dashboard.generateFreeProCode({
        trialDays,
        maxRedemptions: body.maxRedemptions ?? 1,
        description: body.description,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      });
      await this.auth.audit(adminId, 'promo_generate', 'PromoCode', promo.id, {
        code: promo.code,
        trialDays: promo.trialDays,
        maxRedemptions: promo.maxRedemptions,
      });
      return promo;
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'generate failed',
      );
    }
  }

  @Post('promos')
  @UseGuards(AdminSessionGuard)
  async createPromo(
    @AdminId() adminId: string,
    @Body()
    body: {
      description?: string;
      trialDays?: number;
      maxRedemptions?: number | null;
      expiresAt?: string | null;
    },
  ) {
    const trialDays = body.trialDays ?? 30;
    if (!isAllowedPromoDays(trialDays)) {
      throw new BadRequestException('trialDays must be 10, 15, or 30');
    }
    const promo = await this.dashboard.generateFreeProCode({
      trialDays,
      maxRedemptions: body.maxRedemptions ?? 1,
      description: body.description,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    });
    await this.auth.audit(adminId, 'promo_create', 'PromoCode', promo.id, {
      code: promo.code,
      trialDays: promo.trialDays,
    });
    return promo;
  }

  @Patch('promos/:id')
  @UseGuards(AdminSessionGuard)
  async patchPromo(
    @AdminId() adminId: string,
    @Param('id') id: string,
    @Body()
    body: {
      description?: string;
      maxRedemptions?: number | null;
      expiresAt?: string | null;
      active?: boolean;
      trialDays?: number;
    },
  ) {
    if (body.trialDays !== undefined) {
      throw new BadRequestException(
        'trialDays cannot be changed after creation',
      );
    }
    const promo = await this.dashboard.updatePromo(id, {
      description: body.description,
      maxRedemptions: body.maxRedemptions,
      expiresAt:
        body.expiresAt === undefined
          ? undefined
          : body.expiresAt
            ? new Date(body.expiresAt)
            : null,
      active: body.active,
    });
    await this.auth.audit(
      adminId,
      body.active === false ? 'promo_deactivate' : 'promo_update',
      'PromoCode',
      id,
      body,
    );
    return promo;
  }
}
