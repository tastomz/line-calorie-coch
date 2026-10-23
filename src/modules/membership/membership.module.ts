import { ProPlanService } from './pro-plan.service';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { AiGatewayService } from './ai-gateway.service';
import { AiUsageService } from './ai-usage.service';
import { MembershipApiController } from './membership-api.controller';
import { MembershipAuthService } from './membership-auth.service';
import { MembershipBillingService } from './membership-billing.service';
import { MembershipPagesController } from './membership-pages.controller';
import { isUsableStripeKey } from './stripe-key';
import { MembershipSessionGuard } from './membership-session.guard';
import { MembershipService } from './membership.service';
import { AuthLiffController } from './auth-liff.controller';
import { PAYMENT_PROVIDER } from './membership.tokens';
import { MockPaymentProvider } from './mock.payment-provider';
import {
  PaymentProviderPort,
  UnimplementedPaymentProvider,
} from './payment-provider.port';
import { PromoCodeService } from './promo-code.service';
import { StripePaymentProvider } from './stripe.payment-provider';
import { StripeWebhookController } from './stripe-webhook.controller';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';

@Module({
  imports: [PrismaModule, UsersModule, ConfigModule],
  controllers: [
    MembershipApiController,
    MembershipPagesController,
    StripeWebhookController,
    AuthLiffController,
  ],
  providers: [
    SubscriptionEntitlementService,
    AiUsageService,
    AiGatewayService,
    PromoCodeService,
    MembershipService,
    MembershipAuthService,
    MembershipBillingService,
    ProPlanService,
    MembershipSessionGuard,
    StripePaymentProvider,
    MockPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (
        config: ConfigService,
        stripe: StripePaymentProvider,
        mock: MockPaymentProvider,
      ): PaymentProviderPort => {
        const mode = (config.get<string>('PAYMENT_MODE') ?? 'MOCK')
          .trim()
          .toUpperCase();
        const usable = isUsableStripeKey(stripe.mode) && stripe.isConfigured();
        if (mode === 'STRIPE' && usable) {
          return stripe;
        }
        if (mode === 'MOCK' || mode === '') {
          return mock;
        }
        if (usable) {
          return stripe;
        }
        return new UnimplementedPaymentProvider();
      },
      inject: [ConfigService, StripePaymentProvider, MockPaymentProvider],
    },
  ],
  exports: [
    SubscriptionEntitlementService,
    AiUsageService,
    AiGatewayService,
    PromoCodeService,
    MembershipService,
    MembershipAuthService,
    MembershipBillingService,
    ProPlanService,
    MockPaymentProvider,
    PAYMENT_PROVIDER,
  ],
})
export class MembershipModule {}

export type { PaymentProviderPort };
export { PAYMENT_PROVIDER };
