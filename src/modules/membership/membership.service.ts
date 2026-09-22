import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PromoRedeemError } from './membership.errors';
import {
  buildMembershipStatusMessage,
  buildPromoErrorMessage,
  buildPromoSuccessMessage,
} from './membership.messages';
import { MembershipAuthService } from './membership-auth.service';
import { MembershipBillingService } from './membership-billing.service';
import { PromoCodeService } from './promo-code.service';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';

@Injectable()
export class MembershipService {
  constructor(
    private readonly entitlement: SubscriptionEntitlementService,
    private readonly promo: PromoCodeService,
    private readonly auth: MembershipAuthService,
    private readonly billing: MembershipBillingService,
    private readonly config: ConfigService,
  ) {}

  async buildStatusText(userId: string): Promise<string> {
    const [ent, usage] = await Promise.all([
      this.entitlement.getEntitlement(userId),
      this.entitlement.getDailyUsage(userId),
    ]);
    let upgradeUrl: string | null = null;
    const webBase = (this.config.get<string>('MEMBERSHIP_WEB_URL') ?? '')
      .trim()
      .replace(/\/$/, '');
    if (webBase) {
      try {
        upgradeUrl = (await this.auth.createMembershipLink(userId)).url;
      } catch {
        upgradeUrl = `${webBase}/membership`;
      }
    }
    return buildMembershipStatusMessage(ent, usage, {
      upgradeUrl,
      paymentConfigured: this.billing.paymentConfigured(),
    });
  }

  async redeemPromo(userId: string, rawCode: string): Promise<string> {
    try {
      const result = await this.promo.redeem(userId, rawCode);
      return buildPromoSuccessMessage(result);
    } catch (error) {
      if (error instanceof PromoRedeemError) {
        return buildPromoErrorMessage(error.code);
      }
      throw error;
    }
  }
}
