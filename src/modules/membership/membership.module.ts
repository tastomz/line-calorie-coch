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
import { MembershipSessionGuard } from './membership-session.guard';
import { MembershipService } from './membership.service';
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
  ],
  providers: [
    SubscriptionEntitlementService,
    AiUsageService,
    AiGatewayService,
    PromoCodeService,
    MembershipService,
    MembershipAuthService,
    MembershipBillingService,
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
        const secret = (config.get<string>('STRIPE_SECRET_KEY') ?? '').trim();
        if (
          mode === 'STRIPE' &&
          secret.startsWith('sk_test_') &&
          stripe.isConfigured()
        ) {
          return stripe;
        }
        if (mode === 'MOCK' || mode === '') {
          return mock;
        }
        if (secret.startsWith('sk_test_') && stripe.isConfigured()) {
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
    MockPaymentProvider,
    PAYMENT_PROVIDER,
  ],
})
export class MembershipModule {}

export type { PaymentProviderPort };
export { PAYMENT_PROVIDER };
