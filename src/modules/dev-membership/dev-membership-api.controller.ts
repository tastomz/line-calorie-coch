import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminDashboardService } from '../admin/admin-dashboard.service';
import { AiGatewayService } from '../membership/ai-gateway.service';
import { AiQuotaExceededError } from '../membership/membership.errors';
import {
  MEMBERSHIP_SESSION_COOKIE,
  MembershipAuthService,
} from '../membership/membership-auth.service';
import { membershipRateLimiter } from '../membership/membership-rate-limiter';
import { AiOperation } from '../membership/plan.config';
import { SubscriptionEntitlementService } from '../membership/subscription-entitlement.service';
import { UsersService } from '../users/users.service';
import { DEV_TEST_IDENTITIES, DevIdentityKey } from './dev-identities';
import { DevChatService } from './dev-chat.service';
import { DevToolsGuard } from './dev-tools.guard';

@Controller('api/dev')
@UseGuards(DevToolsGuard)
export class DevMembershipApiController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: MembershipAuthService,
    private readonly entitlement: SubscriptionEntitlementService,
    private readonly aiGateway: AiGatewayService,
    private readonly prisma: PrismaService,
    private readonly dashboard: AdminDashboardService,
    private readonly config: ConfigService,
    private readonly chat: DevChatService,
  ) {}

  @Get('identities')
  identities() {
    return Object.values(DEV_TEST_IDENTITIES);
  }

  @Post('identity')
  async switchIdentity(
    @Body() body: { identity?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!membershipRateLimiter.tryConsume('dev', 'dev_tools')) {
      throw new HttpException(
        'Too many attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const key = (body.identity ?? '').trim() as DevIdentityKey;
    const identity = DEV_TEST_IDENTITIES[key];
    if (!identity) {
      throw new BadRequestException('identity must be USER_A | USER_B | ADMIN');
    }
    const { user } = await this.users.findOrCreateByLineUserId(
      identity.lineUserId,
      { displayName: identity.displayName },
    );
    if (key === 'ADMIN' && user.role !== UserRole.ADMIN) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { role: UserRole.ADMIN },
      });
    }
    const token = this.auth.signSession(user.id);
    const secure = (this.config.get<string>('NODE_ENV') ?? '') === 'production';
    res.cookie(MEMBERSHIP_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return {
      ok: true,
      userId: user.id,
      identity: key,
      role: key === 'ADMIN' ? 'ADMIN' : 'USER',
    };
  }

  @Get('membership')
  async membershipStatus(@Req() req: Request) {
    const userId = this.requireSession(req);
    const user = await this.users.findByIdOrThrow(userId);
    const [ent, usage] = await Promise.all([
      this.entitlement.getEntitlement(userId),
      this.entitlement.getDailyUsage(userId),
    ]);
    return {
      user: {
        id: user.id,
        lineUserId: user.lineUserId,
        displayName: user.displayName,
        role: user.role,
      },
      plan: ent.plan,
      status: ent.status,
      hasProAccess: ent.hasProAccess,
      periodEnd: ent.periodEnd,
      provider: ent.subscription?.provider ?? 'NONE',
      trialEndsAt: ent.subscription?.trialEndsAt ?? null,
      currentPeriodEnd: ent.subscription?.currentPeriodEnd ?? null,
      usage,
      limits: this.entitlement.limits(ent.plan),
    };
  }

  @Get('admin/dashboard')
  async getAdminDashboard(@Req() req: Request) {
    await this.requireAdmin(req);
    return this.dashboard.dashboard();
  }

  @Post('ai/consume')
  async consumeAi(
    @Body() body: { operation?: AiOperation },
    @Req() req: Request,
  ) {
    const userId = this.requireSession(req);
    const operation = body.operation;
    if (
      !operation ||
      ![
        'FOOD_TEXT',
        'FOOD_VISION',
        'COMPOSITION_ADJUSTMENT',
        'COACH',
        'CLASSIFY',
      ].includes(operation)
    ) {
      throw new BadRequestException('invalid operation');
    }
    try {
      await this.aiGateway.run(userId, operation, () =>
        Promise.resolve({ ok: true }),
      );
      const limit = await this.entitlement.getDailyLimit(userId, operation);
      const remaining = await this.entitlement.getRemainingQuota(
        userId,
        operation,
      );
      return {
        ok: true,
        operation,
        used: limit - remaining,
        limit,
        remaining,
      };
    } catch (error) {
      if (error instanceof AiQuotaExceededError) {
        throw new HttpException(
          {
            statusCode: 429,
            error: 'QUOTA_EXCEEDED',
            operation: error.operation,
            used: error.used,
            limit: error.limit,
            remaining: 0,
            plan: error.plan,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw error;
    }
  }

  @Post('ai/consume-until-limit')
  async consumeUntilLimit(
    @Body() body: { operation?: AiOperation },
    @Req() req: Request,
  ) {
    const userId = this.requireSession(req);
    const operation = body.operation ?? 'FOOD_TEXT';
    let calls = 0;
    for (let i = 0; i < 50; i += 1) {
      try {
        await this.aiGateway.run(userId, operation, () =>
          Promise.resolve({ ok: true }),
        );
        calls += 1;
      } catch (error) {
        if (error instanceof AiQuotaExceededError) {
          return {
            exhausted: true,
            operation,
            used: error.used,
            limit: error.limit,
            remaining: 0,
            successfulCalls: calls,
          };
        }
        throw error;
      }
    }
    return { exhausted: false, successfulCalls: calls };
  }

  /** Simulated LINE chat — text in, bot replies out (no LINE API). */
  @Post('chat')
  async chatMessage(@Body() body: { identity?: string; text?: string }) {
    if (!membershipRateLimiter.tryConsume('dev-chat', 'dev_tools')) {
      throw new HttpException(
        'Too many attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const key = (body.identity ?? 'USER_A').trim() as DevIdentityKey;
    if (!DEV_TEST_IDENTITIES[key]) {
      throw new BadRequestException('identity must be USER_A | USER_B | ADMIN');
    }
    const text = (body.text ?? '').trim();
    if (!text) {
      throw new BadRequestException('text required');
    }
    try {
      return await this.chat.sendText(key, text);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'chat failed',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('chat/follow')
  async chatFollow(@Body() body: { identity?: string }) {
    const key = (body.identity ?? 'USER_A').trim() as DevIdentityKey;
    if (!DEV_TEST_IDENTITIES[key]) {
      throw new BadRequestException('identity must be USER_A | USER_B | ADMIN');
    }
    return this.chat.follow(key);
  }

  private requireSession(req: Request): string {
    return this.auth.verifySession(
      req.cookies?.[MEMBERSHIP_SESSION_COOKIE] as string | undefined,
    );
  }

  private async requireAdmin(req: Request): Promise<string> {
    const userId = this.requireSession(req);
    const isAdmin = await this.users.isAdminUserId(userId);
    if (!isAdmin) {
      throw new HttpException('Admin role required', HttpStatus.FORBIDDEN);
    }
    return userId;
  }
}
