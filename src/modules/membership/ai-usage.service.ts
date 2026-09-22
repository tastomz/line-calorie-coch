import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiTokenUsageMeta } from './ai-token-capture';
import { AiQuotaExceededError } from './membership.errors';
import { AiOperation } from './plan.config';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';

/**
 * Atomic daily AI usage tracking + per-call token ledger.
 *
 * Behavior on OpenAI failure after a real request was sent:
 * quota is already reserved (consumed) — we do not refund automatically,
 * to avoid retry storms bypassing limits. Documented in docs/MEMBERSHIP.md.
 */
@Injectable()
export class AiUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlement: SubscriptionEntitlementService,
  ) {}

  /**
   * Reserve one unit of quota for `operation` under the user's current plan.
   * Throws AiQuotaExceededError if the daily limit would be exceeded.
   */
  async consumeAiUsage(
    userId: string,
    operation: AiOperation,
    now = new Date(),
  ): Promise<void> {
    const usageDate = this.entitlement.usageDateKey(now);
    const plan = await this.entitlement.getCurrentPlan(userId);
    const limit = await this.entitlement.getDailyLimit(userId, operation);
    const field = this.entitlement.fieldFor(operation);

    await this.prisma.$transaction(async (tx) => {
      await tx.aIUsage.upsert({
        where: { userId_usageDate: { userId, usageDate } },
        create: {
          userId,
          usageDate,
          foodTextCalls: 0,
          visionCalls: 0,
          adjustmentCalls: 0,
          coachCalls: 0,
          classifyCalls: 0,
          totalCalls: 0,
        },
        update: {},
      });

      const where: Prisma.AIUsageWhereInput = {
        userId,
        usageDate,
        [field]: { lt: limit },
      };

      const updated = await tx.aIUsage.updateMany({
        where,
        data: {
          [field]: { increment: 1 },
          totalCalls: { increment: 1 },
        },
      });

      if (updated.count === 0) {
        const row = await tx.aIUsage.findUnique({
          where: { userId_usageDate: { userId, usageDate } },
        });
        const used = row
          ? this.entitlement.usedFor(
              {
                usageDate,
                foodTextCalls: row.foodTextCalls,
                visionCalls: row.visionCalls,
                adjustmentCalls: row.adjustmentCalls,
                coachCalls: row.coachCalls,
                classifyCalls: row.classifyCalls,
                bodyScanCalls: row.bodyScanCalls,
                mealPlanCalls: row.mealPlanCalls,
                weeklyReviewCalls: row.weeklyReviewCalls,
                totalCalls: row.totalCalls,
              },
              operation,
            )
          : limit;
        throw new AiQuotaExceededError(operation, plan, used, limit);
      }
    });
  }

  /** Persist one OpenAI call's token metadata (no prompts/responses). */
  async recordTokenUsage(
    userId: string,
    operation: AiOperation,
    meta: AiTokenUsageMeta,
    now = new Date(),
  ): Promise<void> {
    const usageDate = this.entitlement.usageDateKey(now);
    const inputTokens = Math.max(0, Math.floor(meta.inputTokens));
    const outputTokens = Math.max(0, Math.floor(meta.outputTokens));
    const totalTokens = inputTokens + outputTokens;
    const model = (meta.model ?? '').trim() || 'unknown';
    await this.prisma.aiCallLog.create({
      data: {
        userId,
        operation,
        model,
        inputTokens,
        outputTokens,
        totalTokens,
        usageDate,
      },
    });
  }
}
