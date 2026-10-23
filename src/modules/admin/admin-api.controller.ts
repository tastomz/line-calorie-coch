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
import { readFile } from 'fs/promises';
import { join } from 'path';
import { LineService } from '../line/line.service';
import { AdminNotifyService } from '../users/admin-notify.service';
import { parsePromoParams } from '../membership/promo-code.generator';
import {
  PlanValidationError,
  ProPlanService,
} from '../membership/pro-plan.service';
import type { ProPlanInput } from '../membership/pro-plan.service';
import { membershipRateLimiter } from '../membership/membership-rate-limiter';
import {
  ADMIN_SESSION_COOKIE,
  AdminAuthService,
  AdminPasswordError,
} from './admin-auth.service';
import { AdminAiUsageService } from './admin-ai-usage.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminId } from './admin-session.decorator';
import { AdminSessionGuard } from './admin-session.guard';
import { CodexService } from '../codex/codex.service';

@Controller('admin/api')
export class AdminApiController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly dashboard: AdminDashboardService,
    private readonly aiUsage: AdminAiUsageService,
    private readonly config: ConfigService,
    private readonly plans: ProPlanService,
    private readonly line: LineService,
    private readonly adminNotify: AdminNotifyService,
    private readonly codex: CodexService,
  ) {}

  /** Trial package AI: ChatGPT sign-in (Codex). Never returns tokens. */
  @Get('codex')
  @UseGuards(AdminSessionGuard)
  codexStatus() {
    return this.codex.status();
  }

  /** Paste ~/.codex/auth.json from `codex login` (Sign in with ChatGPT). */
  @Post('codex')
  @UseGuards(AdminSessionGuard)
  async saveCodex(
    @AdminId() adminId: string,
    @Body() body: { authJson?: unknown; model?: unknown },
  ) {
    try {
      if (body.authJson === undefined || body.authJson === '') {
        await this.codex.setModel(body.model);
      } else {
        await this.codex.saveAuth(body.authJson, body.model);
      }
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'save failed',
      );
    }
    await this.auth.audit(adminId, 'codex_save', 'AiCredential', 'codex', {
      authUpdated: body.authJson !== undefined && body.authJson !== '',
    });
    return this.codex.status();
  }

  @Post('codex/test')
  @UseGuards(AdminSessionGuard)
  testCodex() {
    return this.codex.test();
  }

  @Post('codex/remove')
  @UseGuards(AdminSessionGuard)
  async removeCodex(@AdminId() adminId: string) {
    await this.codex.clear();
    await this.auth.audit(adminId, 'codex_remove', 'AiCredential', 'codex', {});
    return this.codex.status();
  }

  /** LINE accounts that get a push when someone asks for an admin. */
  @Get('admin-notify')
  @UseGuards(AdminSessionGuard)
  async listAdminNotify() {
    const rows = await this.adminNotify.listRecipients();
    return rows.map((r) => ({ id: r.id, displayName: r.displayName }));
  }

  /** One-time code the admin sends to the bot from their own LINE. */
  @Post('admin-notify/pair-code')
  @UseGuards(AdminSessionGuard)
  async createAdminNotifyCode(@AdminId() adminId: string) {
    const result = this.adminNotify.createPairCode();
    await this.auth.audit(adminId, 'admin_notify_code', 'User', '-', {});
    return result;
  }

  @Post('admin-notify/:id/remove')
  @UseGuards(AdminSessionGuard)
  async removeAdminNotify(@AdminId() adminId: string, @Param('id') id: string) {
    await this.adminNotify.removeRecipient(id);
    await this.auth.audit(adminId, 'admin_notify_remove', 'User', id, {});
    return { ok: true };
  }

  /**
   * Install the tabbed rich menu (โค้ช / แอดมิน) from public/richmenu/*.jpg.
   * Replaces the OA Manager menu as the default for everyone.
   */
  @Post('rich-menu/setup')
  @UseGuards(AdminSessionGuard)
  async setupRichMenu(@AdminId() adminId: string) {
    const dir = join(process.cwd(), 'public', 'richmenu');
    try {
      const [coach, admin] = await Promise.all([
        readFile(join(dir, 'coach.jpg')),
        readFile(join(dir, 'admin.jpg')),
      ]);
      const liffId = (this.config.get<string>('LIFF_ID') ?? '').trim() || null;
      const ids = await this.line.setupTabbedRichMenu({
        liffId,
        images: { coach, admin },
      });
      await this.auth.audit(adminId, 'rich_menu_setup', 'RichMenu', ids.coach, {
        ...ids,
      });
      return { ok: true, ...ids };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'rich menu setup failed',
      );
    }
  }

  private planError(error: unknown): never {
    if (error instanceof PlanValidationError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }

  /** PRO packages (incl. inactive) with the price users currently see. */
  @Get('plans')
  @UseGuards(AdminSessionGuard)
  async listPlans() {
    return this.plans.adminList();
  }

  @Post('plans')
  @UseGuards(AdminSessionGuard)
  async createPlan(@AdminId() adminId: string, @Body() body: ProPlanInput) {
    try {
      const plan = await this.plans.create(body ?? {});
      await this.auth.audit(adminId, 'plan_create', 'ProPlan', plan.id, {
        code: plan.code,
        priceThb: plan.priceThb,
        days: plan.days,
      });
      return plan;
    } catch (error) {
      this.planError(error);
    }
  }

  @Patch('plans/:id')
  @UseGuards(AdminSessionGuard)
  async patchPlan(
    @AdminId() adminId: string,
    @Param('id') id: string,
    @Body() body: ProPlanInput,
  ) {
    try {
      const plan = await this.plans.update(id, body ?? {});
      await this.auth.audit(adminId, 'plan_update', 'ProPlan', plan.id, {
        code: plan.code,
        priceThb: plan.priceThb,
        days: plan.days,
        active: plan.active,
        discountType: plan.discountType,
        discountValue: plan.discountValue,
      });
      return plan;
    } catch (error) {
      this.planError(error);
    }
  }

  private promoParams(body: {
    trialDays?: unknown;
    maxRedemptions?: unknown;
  }): { trialDays: number; maxRedemptions: number } {
    try {
      return parsePromoParams(body);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'invalid promo parameters',
      );
    }
  }

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

  /** Change the env admin's password; keeps this browser signed in. */
  @Post('password')
  @UseGuards(AdminSessionGuard)
  async changePassword(
    @AdminId() adminId: string,
    @Body() body: { currentPassword?: unknown; newPassword?: unknown },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!membershipRateLimiter.tryConsume(adminId, 'admin_login')) {
      throw new HttpException(
        'Too many attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const current =
      typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const next = typeof body.newPassword === 'string' ? body.newPassword : '';
    try {
      await this.auth.changePassword(adminId, current, next);
    } catch (error) {
      if (error instanceof AdminPasswordError) {
        await this.auth.audit(adminId, 'password_change_failed');
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    await this.auth.audit(adminId, 'password_changed');
    // Older sessions are now invalid — issue a fresh one for this browser.
    const secure = (this.config.get<string>('NODE_ENV') ?? '') === 'production';
    res.cookie(ADMIN_SESSION_COOKIE, this.auth.signSession(adminId), {
      httpOnly: true,
      sameSite: 'strict',
      secure,
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    });
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

  /** Stop a user's Trial now (→ FREE, or their paid Pro if any). */
  @Post('users/:id/end-trial')
  @UseGuards(AdminSessionGuard)
  async endTrial(@AdminId() adminId: string, @Param('id') id: string) {
    const closed = await this.dashboard.endTrial(id);
    if (closed === 0) {
      throw new BadRequestException('ผู้ใช้นี้ไม่ได้อยู่ใน Trial');
    }
    await this.auth.audit(adminId, 'end_trial', 'User', id, { closed });
    return this.dashboard.getUserDetail(id);
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
    const { trialDays, maxRedemptions } = this.promoParams(body);
    try {
      const promo = await this.dashboard.generateFreeProCode({
        trialDays,
        maxRedemptions,
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
    const { trialDays, maxRedemptions } = this.promoParams(body);
    const promo = await this.dashboard.generateFreeProCode({
      trialDays,
      maxRedemptions,
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

  private parseAiRange(
    range?: string,
    from?: string,
    to?: string,
  ): { fromDate: string; toDate: string } {
    const r = (range ?? '7d').toLowerCase();
    const allowed = new Set(['today', '7d', '30d', 'custom']);
    if (!allowed.has(r)) {
      throw new BadRequestException('range must be today|7d|30d|custom');
    }
    if (r === 'custom' && (!from || !to)) {
      throw new BadRequestException(
        'custom range requires from and to (YYYY-MM-DD)',
      );
    }
    return this.aiUsage.resolveDateRange(
      r as 'today' | '7d' | '30d' | 'custom',
      from,
      to,
    );
  }

  @Get('ai-usage/summary')
  @UseGuards(AdminSessionGuard)
  async aiUsageSummary(
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { fromDate, toDate } = this.parseAiRange(range, from, to);
    return this.aiUsage.summary(fromDate, toDate);
  }

  @Get('ai-usage/by-feature')
  @UseGuards(AdminSessionGuard)
  async aiUsageByFeature(
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { fromDate, toDate } = this.parseAiRange(range, from, to);
    return {
      fromDate,
      toDate,
      rows: await this.aiUsage.byFeature(fromDate, toDate),
    };
  }

  @Get('ai-usage/by-day')
  @UseGuards(AdminSessionGuard)
  async aiUsageByDay(
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { fromDate, toDate } = this.parseAiRange(range, from, to);
    return {
      fromDate,
      toDate,
      rows: await this.aiUsage.byDay(fromDate, toDate),
    };
  }

  @Get('ai-usage/by-model')
  @UseGuards(AdminSessionGuard)
  async aiUsageByModel(
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { fromDate, toDate } = this.parseAiRange(range, from, to);
    return {
      fromDate,
      toDate,
      rows: await this.aiUsage.byModel(fromDate, toDate),
    };
  }

  @Get('ai-usage/by-membership')
  @UseGuards(AdminSessionGuard)
  async aiUsageByMembership(
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { fromDate, toDate } = this.parseAiRange(range, from, to);
    return {
      fromDate,
      toDate,
      ...(await this.aiUsage.byMembership(fromDate, toDate)),
    };
  }

  @Get('ai-usage/by-user')
  @UseGuards(AdminSessionGuard)
  async aiUsageByUser(
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const { fromDate, toDate } = this.parseAiRange(range, from, to);
    const n = Number(limit ?? '50');
    return {
      fromDate,
      toDate,
      rows: await this.aiUsage.byUser(
        fromDate,
        toDate,
        Number.isFinite(n) ? n : 50,
      ),
    };
  }
}
