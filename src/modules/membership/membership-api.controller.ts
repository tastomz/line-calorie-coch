import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { UsersService } from '../users/users.service';
import { PromoRedeemError } from './membership.errors';
import {
  MEMBERSHIP_SESSION_COOKIE,
  MembershipAuthService,
} from './membership-auth.service';
import { MembershipBillingService } from './membership-billing.service';
import {
  MembershipSessionGuard,
  MembershipUserId,
} from './membership-session.guard';
import { membershipRateLimiter } from './membership-rate-limiter';
import { MockPaymentProvider } from './mock.payment-provider';
import {
  FREE_AI_LIMITS,
  PRO_AI_LIMITS,
  PRO_MONTHLY_PRICE_THB,
  limitsForPlan,
} from './plan.config';
import { PromoCodeService } from './promo-code.service';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';

@Controller('api/membership')
export class MembershipApiController {
  constructor(
    private readonly auth: MembershipAuthService,
    private readonly entitlement: SubscriptionEntitlementService,
    private readonly billing: MembershipBillingService,
    private readonly promo: PromoCodeService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    private readonly mockPayments: MockPaymentProvider,
  ) {}

  @Get()
  @UseGuards(MembershipSessionGuard)
  async getMembership(@MembershipUserId() userId: string) {
    return this.buildAccountPayload(userId);
  }

  @Get('usage')
  @UseGuards(MembershipSessionGuard)
  async getUsage(@MembershipUserId() userId: string) {
    const [ent, usage] = await Promise.all([
      this.entitlement.getEntitlement(userId),
      this.entitlement.getDailyUsage(userId),
    ]);
    const limits = limitsForPlan(ent.plan);
    return { plan: ent.plan, usage, limits };
  }

  /** Exchange one-time LINE link token for session cookie. */
  @Post('auth/link')
  async authLink(
    @Body() body: { token?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!membershipRateLimiter.tryConsume('link', 'link_consume')) {
      throw new HttpException(
        'Too many attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const token = (body.token ?? '').trim();
    if (!token) {
      throw new BadRequestException('token required');
    }
    const userId = await this.auth.consumeLinkToken(token);
    this.setSessionCookie(res, userId);
    return { ok: true };
  }

  /** LINE Login / LIFF ID token → session. */
  @Post('auth/line')
  async authLine(
    @Body() body: { idToken?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!membershipRateLimiter.tryConsume('line', 'membership_login')) {
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
    this.setSessionCookie(res, userId);
    return { ok: true };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(MEMBERSHIP_SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Post('checkout')
  @UseGuards(MembershipSessionGuard)
  async checkout(@MembershipUserId() userId: string) {
    if (!this.checkoutEnabled()) {
      throw new HttpException(
        'การชำระเงินยังไม่เปิดให้บริการ',
        HttpStatus.FORBIDDEN,
      );
    }
    if (!membershipRateLimiter.tryConsume(userId, 'checkout')) {
      throw new HttpException(
        'Too many attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    try {
      return await this.billing.createCheckout(userId);
    } catch (error) {
      throw new HttpException(
        error instanceof Error
          ? error.message
          : 'ยังไม่สามารถเปิดสมาชิก Pro ได้ครับ ลองใหม่อีกครั้ง',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * MOCK payment completion — only when PAYMENT_MODE=MOCK.
   * Goes through the same webhook domain handler (PaymentEvent + Subscription).
   */
  @Post('mock/complete')
  @UseGuards(MembershipSessionGuard)
  async mockComplete(
    @MembershipUserId() userId: string,
    @Body()
    body: {
      sessionId?: string;
      outcome?: 'success' | 'fail' | 'past_due' | 'cancel';
    },
  ) {
    const mode = (this.config.get<string>('PAYMENT_MODE') ?? 'MOCK')
      .trim()
      .toUpperCase();
    if (mode !== 'MOCK') {
      throw new HttpException('Mock payment disabled', HttpStatus.FORBIDDEN);
    }
    const sessionId = (body.sessionId ?? '').trim();
    if (!sessionId) throw new BadRequestException('sessionId required');
    const session = this.mockPayments.getSession(sessionId);
    if (!session || session.userId !== userId) {
      throw new HttpException('session not found', HttpStatus.NOT_FOUND);
    }
    const outcome = body.outcome ?? 'success';
    const event = this.mockPayments.simulateOutcome(sessionId, outcome);
    const result = await this.billing.handleVerifiedWebhook(event);
    return { ok: true, result, outcome };
  }

  @Post('cancel')
  @UseGuards(MembershipSessionGuard)
  async cancel(@MembershipUserId() userId: string) {
    try {
      const result = await this.billing.cancel(userId);
      return {
        ok: true,
        message: result.periodEnd
          ? `สมาชิกจะสิ้นสุดวันที่ ${result.periodEnd.toISOString()}`
          : 'ยกเลิกสมาชิกแล้ว',
        periodEnd: result.periodEnd,
      };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'ยกเลิกไม่สำเร็จ',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('resume')
  @UseGuards(MembershipSessionGuard)
  async resume(@MembershipUserId() userId: string) {
    try {
      await this.billing.resume(userId);
      return { ok: true };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'กลับมาใช้งานไม่สำเร็จ',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('promo/redeem')
  @UseGuards(MembershipSessionGuard)
  async redeemPromo(
    @MembershipUserId() userId: string,
    @Body() body: { code?: string },
  ) {
    if (!membershipRateLimiter.tryConsume(userId, 'promo_redeem')) {
      throw new HttpException(
        'Too many attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    try {
      const result = await this.promo.redeem(userId, body.code ?? '');
      return { ok: true, ...result };
    } catch (error) {
      if (error instanceof PromoRedeemError) {
        throw new HttpException(error.code, HttpStatus.BAD_REQUEST);
      }
      throw error;
    }
  }

  @Get('config')
  publicConfig() {
    const mode = (this.config.get<string>('PAYMENT_MODE') ?? 'MOCK')
      .trim()
      .toUpperCase();
    return {
      priceThbMonthly: PRO_MONTHLY_PRICE_THB,
      freeLimits: FREE_AI_LIMITS,
      proLimits: PRO_AI_LIMITS,
      paymentConfigured: this.billing.paymentConfigured(),
      paymentMode: mode,
      /** Explicit opt-in — false by default so users cannot start payment accidentally. */
      checkoutEnabled: this.checkoutEnabled(),
      lineLoginChannelId:
        (this.config.get<string>('LINE_LOGIN_CHANNEL_ID') ?? '').trim() || null,
      membershipWebUrl:
        (this.config.get<string>('MEMBERSHIP_WEB_URL') ?? '').trim() || null,
      loginPath: '/login',
      accountPath: '/account',
    };
  }

  /** Checkout UI/API only when ENABLE_MEMBERSHIP_CHECKOUT=true AND provider is configured. */
  private checkoutEnabled(): boolean {
    const flag = (this.config.get<string>('ENABLE_MEMBERSHIP_CHECKOUT') ?? '')
      .trim()
      .toLowerCase();
    if (flag !== 'true' && flag !== '1' && flag !== 'yes') {
      return false;
    }
    return this.billing.paymentConfigured();
  }

  private setSessionCookie(res: Response, userId: string) {
    const token = this.auth.signSession(userId);
    const secure = (this.config.get<string>('NODE_ENV') ?? '') === 'production';
    res.cookie(MEMBERSHIP_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private async buildAccountPayload(userId: string) {
    const user = await this.users.findByIdOrThrow(userId);
    const [ent, usage] = await Promise.all([
      this.entitlement.getEntitlement(userId),
      this.entitlement.getDailyUsage(userId),
    ]);
    const limits = limitsForPlan(ent.plan);
    return {
      displayName: user.displayName,
      plan: ent.plan,
      status: ent.status,
      hasProAccess: ent.hasProAccess,
      periodEnd: ent.periodEnd,
      subscription: ent.subscription
        ? {
            startedAt: ent.subscription.startedAt,
            currentPeriodStart: ent.subscription.currentPeriodStart,
            currentPeriodEnd: ent.subscription.currentPeriodEnd,
            canceledAt: ent.subscription.canceledAt,
            provider: ent.subscription.provider,
            // Never expose providerCustomerId / providerSubscriptionId to client
          }
        : null,
      usage,
      limits,
      priceThbMonthly: PRO_MONTHLY_PRICE_THB,
      paymentConfigured: this.billing.paymentConfigured(),
      checkoutEnabled: this.checkoutEnabled(),
    };
  }
}
