import { Injectable } from '@nestjs/common';
import { PaymentProvider, Plan, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PromoRedeemError } from './membership.errors';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';

export type PromoRedeemResult = {
  trialDays: number;
  expiresAt: Date;
  code: string;
};

@Injectable()
export class PromoCodeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlement: SubscriptionEntitlementService,
  ) {}

  normalizeCode(raw: string): string {
    return raw.trim().toUpperCase().replace(/\s+/g, '');
  }

  async redeem(userId: string, rawCode: string): Promise<PromoRedeemResult> {
    const code = this.normalizeCode(rawCode);
    if (!code) {
      throw new PromoRedeemError('invalid', 'empty code');
    }

    const now = new Date();
    const existing = await this.entitlement.getLatestSubscription(userId);
    const entitlement = this.entitlement.resolveEntitlement(existing, now);

    if (
      entitlement.hasProAccess &&
      this.entitlement.isPaidActivePro(existing, now)
    ) {
      throw new PromoRedeemError('already_pro', 'paid pro active');
    }

    if (
      entitlement.hasProAccess &&
      entitlement.status === SubscriptionStatus.TRIALING
    ) {
      throw new PromoRedeemError('trial_active', 'trial already active');
    }

    if (
      entitlement.hasProAccess &&
      entitlement.status === SubscriptionStatus.CANCELED
    ) {
      throw new PromoRedeemError('already_pro', 'pro until period end');
    }

    return this.prisma.$transaction(async (tx) => {
      const promo = await tx.promoCode.findUnique({ where: { code } });
      if (!promo) {
        throw new PromoRedeemError('invalid', 'not found');
      }
      if (!promo.active) {
        throw new PromoRedeemError('inactive', 'inactive');
      }
      if (promo.expiresAt && promo.expiresAt.getTime() <= now.getTime()) {
        throw new PromoRedeemError('expired', 'expired');
      }

      const prior = await tx.promoRedemption.findUnique({
        where: {
          promoCodeId_userId: { promoCodeId: promo.id, userId },
        },
      });
      if (prior) {
        throw new PromoRedeemError('already_redeemed', 'already redeemed');
      }

      if (
        promo.maxRedemptions != null &&
        promo.redeemedCount >= promo.maxRedemptions
      ) {
        throw new PromoRedeemError('max_reached', 'max redemptions');
      }

      const updated = await tx.promoCode.updateMany({
        where: {
          id: promo.id,
          active: true,
          ...(promo.maxRedemptions == null
            ? {}
            : { redeemedCount: { lt: promo.maxRedemptions } }),
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { redeemedCount: { increment: 1 } },
      });
      if (updated.count === 0) {
        throw new PromoRedeemError('max_reached', 'max redemptions race');
      }

      const expiresAt = new Date(
        now.getTime() + promo.trialDays * 24 * 60 * 60 * 1000,
      );

      await tx.promoRedemption.create({
        data: {
          promoCodeId: promo.id,
          userId,
          redeemedAt: now,
          expiresAt,
        },
      });

      // Create a TRIALING PRO subscription (do not touch paid provider ids).
      await tx.subscription.create({
        data: {
          userId,
          plan: Plan.PRO,
          status: SubscriptionStatus.TRIALING,
          provider: PaymentProvider.NONE,
          trialStartedAt: now,
          trialEndsAt: expiresAt,
          startedAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: expiresAt,
        },
      });

      return { trialDays: promo.trialDays, expiresAt, code: promo.code };
    });
  }
}
