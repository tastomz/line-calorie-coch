import { Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  generateTastomPromoCode,
  isAllowedPromoDays,
} from '../membership/promo-code.generator';
import { SubscriptionEntitlementService } from '../membership/subscription-entitlement.service';

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlement: SubscriptionEntitlementService,
  ) {}

  async dashboard() {
    const [totalUsers, subscriptions, usageAgg, promoCount] = await Promise.all(
      [
        this.prisma.user.count(),
        this.prisma.subscription.findMany({
          orderBy: { updatedAt: 'desc' },
          take: 500,
        }),
        this.prisma.aIUsage.aggregate({
          _sum: {
            foodTextCalls: true,
            visionCalls: true,
            adjustmentCalls: true,
            coachCalls: true,
            classifyCalls: true,
            totalCalls: true,
          },
        }),
        this.prisma.promoCode.count(),
      ],
    );

    let free = 0;
    let pro = 0;
    let trial = 0;
    let active = 0;
    let canceled = 0;
    const seen = new Set<string>();
    for (const sub of subscriptions) {
      if (seen.has(sub.userId)) continue;
      seen.add(sub.userId);
      const ent = this.entitlement.resolveEntitlement(sub);
      if (ent.hasProAccess) {
        pro += 1;
        if (ent.status === SubscriptionStatus.TRIALING) trial += 1;
        if (ent.status === SubscriptionStatus.ACTIVE) active += 1;
        if (ent.status === SubscriptionStatus.CANCELED) canceled += 1;
      } else {
        free += 1;
      }
    }
    free += Math.max(0, totalUsers - seen.size);

    return {
      totalUsers,
      freeUsers: free,
      proUsers: pro,
      trialUsers: trial,
      activeSubscriptions: active,
      canceledSubscriptions: canceled,
      promoCodes: promoCount,
      aiUsageTotals: {
        foodText: usageAgg._sum.foodTextCalls ?? 0,
        vision: usageAgg._sum.visionCalls ?? 0,
        adjustment: usageAgg._sum.adjustmentCalls ?? 0,
        coach: usageAgg._sum.coachCalls ?? 0,
        classify: usageAgg._sum.classifyCalls ?? 0,
        total: usageAgg._sum.totalCalls ?? 0,
      },
      revenueNote:
        'Revenue from Stripe LIVE is not enabled. Use Stripe Dashboard TEST mode for payment metrics.',
    };
  }

  async searchUsers(q: string) {
    const query = q.trim();
    if (!query) return [];
    return this.prisma.user.findMany({
      where: {
        OR: [
          { id: query },
          { lineUserId: query },
          { displayName: { contains: query } },
        ],
      },
      take: 20,
      select: {
        id: true,
        lineUserId: true,
        displayName: true,
        createdAt: true,
      },
    });
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    const [subscription, usage, redemptions] = await Promise.all([
      this.prisma.subscription.findFirst({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      }),
      this.entitlement.getDailyUsage(userId),
      this.prisma.promoRedemption.findMany({
        where: { userId },
        include: { promoCode: true },
        orderBy: { redeemedAt: 'desc' },
        take: 20,
      }),
    ]);
    const ent = this.entitlement.resolveEntitlement(subscription);
    return {
      user: {
        id: user.id,
        lineUserId: user.lineUserId,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
      entitlement: {
        plan: ent.plan,
        status: ent.status,
        hasProAccess: ent.hasProAccess,
        periodEnd: ent.periodEnd,
      },
      subscription: subscription
        ? {
            id: subscription.id,
            plan: subscription.plan,
            status: subscription.status,
            provider: subscription.provider,
            providerCustomerId: subscription.providerCustomerId,
            providerSubscriptionId: subscription.providerSubscriptionId,
            trialEndsAt: subscription.trialEndsAt,
            currentPeriodEnd: subscription.currentPeriodEnd,
            canceledAt: subscription.canceledAt,
          }
        : null,
      usage,
      promoRedemptions: redemptions.map((r) => ({
        code: r.promoCode.code,
        redeemedAt: r.redeemedAt,
        expiresAt: r.expiresAt,
      })),
    };
  }

  async listPromos() {
    return this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createPromo(data: {
    code: string;
    description?: string;
    trialDays: number;
    maxRedemptions?: number | null;
    expiresAt?: Date | null;
    active?: boolean;
  }) {
    const code = data.code.trim().toUpperCase().replace(/\s+/g, '');
    return this.prisma.promoCode.create({
      data: {
        code,
        description: data.description,
        trialDays: data.trialDays,
        maxRedemptions: data.maxRedemptions ?? null,
        expiresAt: data.expiresAt ?? null,
        active: data.active ?? true,
      },
    });
  }

  async generateFreeProCode(params: {
    trialDays: number;
    maxRedemptions?: number | null;
    description?: string;
    expiresAt?: Date | null;
  }) {
    if (!isAllowedPromoDays(params.trialDays)) {
      throw new Error('trialDays must be 10, 15, or 30');
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = generateTastomPromoCode();
      try {
        return await this.prisma.promoCode.create({
          data: {
            code,
            description:
              params.description ?? `Free PRO ${params.trialDays} days`,
            trialDays: params.trialDays,
            maxRedemptions: params.maxRedemptions ?? 1,
            expiresAt: params.expiresAt ?? null,
            active: true,
          },
        });
      } catch {
        // unique collision — retry
      }
    }
    throw new Error('Failed to generate unique promo code');
  }

  async updatePromo(
    id: string,
    data: {
      description?: string;
      maxRedemptions?: number | null;
      expiresAt?: Date | null;
      active?: boolean;
    },
  ) {
    // Duration is immutable after creation.
    return this.prisma.promoCode.update({ where: { id }, data });
  }
}
