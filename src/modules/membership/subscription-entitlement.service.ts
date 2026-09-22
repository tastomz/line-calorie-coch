import { Injectable } from '@nestjs/common';
import {
  PaymentProvider,
  Plan,
  Prisma,
  Subscription,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getZonedDateParts } from '../food/day-bounds';
import {
  AiOperation,
  FREE_PLAN,
  PRO_PLAN,
  limitFor,
  limitsForPlan,
  PlanId,
} from './plan.config';

export type EffectiveEntitlement = {
  plan: PlanId;
  status: SubscriptionStatus | 'NONE';
  hasProAccess: boolean;
  subscription: Subscription | null;
  periodEnd: Date | null;
};

export type DailyUsageSnapshot = {
  usageDate: string;
  foodTextCalls: number;
  visionCalls: number;
  adjustmentCalls: number;
  coachCalls: number;
  classifyCalls: number;
  bodyScanCalls: number;
  mealPlanCalls: number;
  weeklyReviewCalls: number;
  totalCalls: number;
};

@Injectable()
export class SubscriptionEntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  /** Calendar day key in APP_TIMEZONE (YYYY-MM-DD). */
  usageDateKey(now = new Date()): string {
    const p = getZonedDateParts(now);
    const mm = String(p.month).padStart(2, '0');
    const dd = String(p.day).padStart(2, '0');
    return `${p.year}-${mm}-${dd}`;
  }

  async getLatestSubscription(userId: string): Promise<Subscription | null> {
    return this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Resolve whether the user currently has PRO access.
   * No row ⇒ FREE. Dates override stale status labels.
   */
  resolveEntitlement(
    sub: Subscription | null,
    now = new Date(),
  ): EffectiveEntitlement {
    if (!sub) {
      return {
        plan: 'FREE',
        status: 'NONE',
        hasProAccess: false,
        subscription: null,
        periodEnd: null,
      };
    }

    if (sub.plan === Plan.PRO && sub.status === SubscriptionStatus.TRIALING) {
      if (sub.trialEndsAt && sub.trialEndsAt.getTime() > now.getTime()) {
        return {
          plan: 'PRO',
          status: SubscriptionStatus.TRIALING,
          hasProAccess: true,
          subscription: sub,
          periodEnd: sub.trialEndsAt,
        };
      }
      return {
        plan: 'FREE',
        status: SubscriptionStatus.EXPIRED,
        hasProAccess: false,
        subscription: sub,
        periodEnd: sub.trialEndsAt,
      };
    }

    if (sub.plan === Plan.PRO && sub.status === SubscriptionStatus.ACTIVE) {
      if (
        sub.currentPeriodEnd &&
        sub.currentPeriodEnd.getTime() <= now.getTime()
      ) {
        return {
          plan: 'FREE',
          status: SubscriptionStatus.EXPIRED,
          hasProAccess: false,
          subscription: sub,
          periodEnd: sub.currentPeriodEnd,
        };
      }
      return {
        plan: 'PRO',
        status: SubscriptionStatus.ACTIVE,
        hasProAccess: true,
        subscription: sub,
        periodEnd: sub.currentPeriodEnd,
      };
    }

    if (sub.plan === Plan.PRO && sub.status === SubscriptionStatus.CANCELED) {
      if (
        sub.currentPeriodEnd &&
        sub.currentPeriodEnd.getTime() > now.getTime()
      ) {
        return {
          plan: 'PRO',
          status: SubscriptionStatus.CANCELED,
          hasProAccess: true,
          subscription: sub,
          periodEnd: sub.currentPeriodEnd,
        };
      }
      return {
        plan: 'FREE',
        status: SubscriptionStatus.CANCELED,
        hasProAccess: false,
        subscription: sub,
        periodEnd: sub.currentPeriodEnd,
      };
    }

    if (sub.status === SubscriptionStatus.PAST_DUE) {
      // Distinct state — do not grant unlimited PRO.
      return {
        plan: 'FREE',
        status: SubscriptionStatus.PAST_DUE,
        hasProAccess: false,
        subscription: sub,
        periodEnd: sub.currentPeriodEnd,
      };
    }

    return {
      plan: 'FREE',
      status: sub.status,
      hasProAccess: false,
      subscription: sub,
      periodEnd: sub.currentPeriodEnd ?? sub.trialEndsAt,
    };
  }

  async getEntitlement(
    userId: string,
    now = new Date(),
  ): Promise<EffectiveEntitlement> {
    const sub = await this.getLatestSubscription(userId);
    return this.resolveEntitlement(sub, now);
  }

  async getCurrentPlan(userId: string): Promise<PlanId> {
    return (await this.getEntitlement(userId)).plan;
  }

  async hasProAccess(userId: string): Promise<boolean> {
    return (await this.getEntitlement(userId)).hasProAccess;
  }

  async getDailyUsage(
    userId: string,
    now = new Date(),
  ): Promise<DailyUsageSnapshot> {
    const usageDate = this.usageDateKey(now);
    const row = await this.prisma.aIUsage.findUnique({
      where: { userId_usageDate: { userId, usageDate } },
    });
    return {
      usageDate,
      foodTextCalls: row?.foodTextCalls ?? 0,
      visionCalls: row?.visionCalls ?? 0,
      adjustmentCalls: row?.adjustmentCalls ?? 0,
      coachCalls: row?.coachCalls ?? 0,
      classifyCalls: row?.classifyCalls ?? 0,
      bodyScanCalls: row?.bodyScanCalls ?? 0,
      mealPlanCalls: row?.mealPlanCalls ?? 0,
      weeklyReviewCalls: row?.weeklyReviewCalls ?? 0,
      totalCalls: row?.totalCalls ?? 0,
    };
  }

  async getDailyLimit(userId: string, operation: AiOperation): Promise<number> {
    const plan = await this.getCurrentPlan(userId);
    return limitFor(plan, operation);
  }

  usedFor(usage: DailyUsageSnapshot, operation: AiOperation): number {
    switch (operation) {
      case 'FOOD_TEXT':
        return usage.foodTextCalls;
      case 'FOOD_VISION':
        return usage.visionCalls;
      case 'COMPOSITION_ADJUSTMENT':
        return usage.adjustmentCalls;
      case 'COACH':
        return usage.coachCalls;
      case 'CLASSIFY':
        return usage.classifyCalls;
      case 'BODY_SCAN':
        return usage.bodyScanCalls;
      case 'MEAL_PLAN':
        return usage.mealPlanCalls;
      case 'WEEKLY_REVIEW':
        return usage.weeklyReviewCalls;
      default:
        return 0;
    }
  }

  async getRemainingQuota(
    userId: string,
    operation: AiOperation,
  ): Promise<number> {
    const [usage, limit] = await Promise.all([
      this.getDailyUsage(userId),
      this.getDailyLimit(userId, operation),
    ]);
    return Math.max(0, limit - this.usedFor(usage, operation));
  }

  async canUseAi(userId: string, operation: AiOperation): Promise<boolean> {
    return (await this.getRemainingQuota(userId, operation)) > 0;
  }

  fieldFor(operation: AiOperation): keyof Prisma.AIUsageUpdateInput {
    switch (operation) {
      case 'FOOD_TEXT':
        return 'foodTextCalls';
      case 'FOOD_VISION':
        return 'visionCalls';
      case 'COMPOSITION_ADJUSTMENT':
        return 'adjustmentCalls';
      case 'COACH':
        return 'coachCalls';
      case 'CLASSIFY':
        return 'classifyCalls';
      case 'BODY_SCAN':
        return 'bodyScanCalls';
      case 'MEAL_PLAN':
        return 'mealPlanCalls';
      case 'WEEKLY_REVIEW':
        return 'weeklyReviewCalls';
    }
  }

  planLabel(plan: PlanId): string {
    return plan === 'PRO' ? PRO_PLAN.labelTh : FREE_PLAN.labelTh;
  }

  limits(plan: PlanId) {
    return limitsForPlan(plan);
  }

  /** Ensure a FREE ACTIVE placeholder is not required — default is no row. */
  ensureFreeDefault(userId: string): Promise<void> {
    void userId;
    // Explicit no-op: absence of Subscription ⇒ FREE.
    return Promise.resolve();
  }

  isPaidActivePro(sub: Subscription | null, now = new Date()): boolean {
    if (!sub) return false;
    if (sub.plan !== Plan.PRO) return false;
    if (
      sub.provider === PaymentProvider.NONE &&
      sub.status === SubscriptionStatus.TRIALING
    ) {
      return false;
    }
    if (sub.status === SubscriptionStatus.ACTIVE) {
      if (
        sub.currentPeriodEnd &&
        sub.currentPeriodEnd.getTime() <= now.getTime()
      ) {
        return false;
      }
      return (
        sub.provider !== PaymentProvider.NONE ||
        Boolean(sub.providerSubscriptionId)
      );
    }
    if (sub.status === SubscriptionStatus.CANCELED) {
      return Boolean(
        sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now.getTime(),
      );
    }
    return false;
  }
}
