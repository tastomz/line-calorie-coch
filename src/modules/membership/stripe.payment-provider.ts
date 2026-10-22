import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  CheckoutSessionRequest,
  CheckoutSessionResult,
  FuturePaymentWebhookEvent,
  PaymentProviderPort,
  ProviderSubscriptionSnapshot,
} from './payment-provider.port';
import { PRO_MONTHLY_PRICE_THB } from './plan.config';

/** Marks a Checkout Session as a one-time PromptPay PRO pass. */
export const PRO_PASS_KIND = 'pro_pass';

/**
 * Stripe adapter — TEST/SANDBOX keys only (`sk_test_…`).
 * Checkout = one-time PromptPay QR payment that buys a PRO pass
 * (PromptPay cannot be used for Stripe subscriptions).
 * Live keys (`sk_live_…`) are rejected.
 * PAYMENT LIVE = NOT ACTIVE.
 */
@Injectable()
export class StripePaymentProvider implements PaymentProviderPort {
  private readonly logger = new Logger(StripePaymentProvider.name);
  private readonly client: Stripe | null;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    const secret = (this.config.get<string>('STRIPE_SECRET_KEY') ?? '').trim();
    this.webhookSecret = (
      this.config.get<string>('STRIPE_WEBHOOK_SECRET') ?? ''
    ).trim();

    if (!secret) {
      this.client = null;
      return;
    }
    if (secret.startsWith('sk_live_')) {
      throw new Error(
        'STRIPE_SECRET_KEY must be a TEST key (sk_test_…). Live keys are blocked.',
      );
    }
    if (!secret.startsWith('sk_test_')) {
      this.logger.warn(
        'STRIPE_SECRET_KEY does not look like sk_test_; Stripe client disabled',
      );
      this.client = null;
      return;
    }
    this.client = new Stripe(secret, {
      apiVersion: '2026-08-26.dahlia',
    });
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  private requireClient(): Stripe {
    if (!this.client) {
      throw new Error('Stripe TEST mode is not configured (STRIPE_SECRET_KEY)');
    }
    return this.client;
  }

  async createCustomer(
    userId: string,
    email?: string,
  ): Promise<{ customerId: string }> {
    const stripe = this.requireClient();
    const customer = await stripe.customers.create({
      metadata: { internalUserId: userId },
      ...(email ? { email } : {}),
    });
    return { customerId: customer.id };
  }

  async createCheckoutSession(
    request: CheckoutSessionRequest,
  ): Promise<CheckoutSessionResult> {
    const stripe = this.requireClient();
    if (request.priceThbMonthly !== PRO_MONTHLY_PRICE_THB) {
      throw new Error(
        `Checkout price must be ${PRO_MONTHLY_PRICE_THB} THB/month`,
      );
    }

    let customerId = request.providerCustomerId;
    if (!customerId) {
      const created = await this.createCustomer(request.userId);
      customerId = created.customerId;
    }

    const metadata = {
      internalUserId: request.userId,
      kind: PRO_PASS_KIND,
      passDays: String(request.passDays),
    };
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['promptpay'],
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'thb',
            // Stripe amounts are in satang (1 THB = 100).
            unit_amount: request.priceThbMonthly * 100,
            product_data: {
              name: `Kcal Coach Pro ${request.passDays} วัน`,
            },
          },
        },
      ],
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      client_reference_id: request.userId,
      metadata,
      payment_intent_data: { metadata },
    });

    if (!session.url) {
      throw new Error('Stripe Checkout Session missing url');
    }

    return { sessionId: session.id, url: session.url, customerId };
  }

  async getSubscription(
    providerSubscriptionId: string,
  ): Promise<ProviderSubscriptionSnapshot | null> {
    const stripe = this.requireClient();
    try {
      const sub = await stripe.subscriptions.retrieve(providerSubscriptionId);
      return this.toSnapshot(sub);
    } catch {
      return null;
    }
  }

  async cancelSubscription(
    providerSubscriptionId: string,
  ): Promise<ProviderSubscriptionSnapshot> {
    const stripe = this.requireClient();
    const sub = await stripe.subscriptions.update(providerSubscriptionId, {
      cancel_at_period_end: true,
    });
    return this.toSnapshot(sub);
  }

  async resumeSubscription(
    providerSubscriptionId: string,
  ): Promise<ProviderSubscriptionSnapshot> {
    const stripe = this.requireClient();
    const sub = await stripe.subscriptions.update(providerSubscriptionId, {
      cancel_at_period_end: false,
    });
    return this.toSnapshot(sub);
  }

  verifyAndParseWebhook(
    rawBody: Buffer,
    signatureHeader: string | undefined,
  ): Promise<{
    type: FuturePaymentWebhookEvent | 'ignored';
    data: unknown;
    providerEventId: string;
    stripeType: string;
  }> {
    const stripe = this.requireClient();
    if (!this.webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is required for webhooks');
    }
    if (!signatureHeader) {
      throw new Error('Missing Stripe-Signature header');
    }

    const event = stripe.webhooks.constructEvent(
      rawBody,
      signatureHeader,
      this.webhookSecret,
    );

    return Promise.resolve({
      type: this.mapEventType(event.type),
      data: event.data.object,
      providerEventId: event.id,
      stripeType: event.type,
    });
  }

  private mapEventType(
    stripeType: string,
  ): FuturePaymentWebhookEvent | 'ignored' {
    switch (stripeType) {
      // PromptPay may confirm after the session completes.
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        return 'checkout_completed';
      case 'customer.subscription.created':
        return 'subscription_created';
      case 'customer.subscription.updated':
        return 'subscription_updated';
      case 'customer.subscription.deleted':
        return 'subscription_canceled';
      case 'invoice.paid':
        return 'invoice_paid';
      case 'invoice.payment_failed':
        return 'invoice_payment_failed';
      default:
        return 'ignored';
    }
  }

  private toSnapshot(sub: Stripe.Subscription): ProviderSubscriptionSnapshot {
    const customerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    const periodEnd = (sub as { current_period_end?: number })
      .current_period_end;
    return {
      providerSubscriptionId: sub.id,
      providerCustomerId: customerId ?? '',
      status: sub.status,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      currentPeriodStart: (() => {
        const start = (sub as { current_period_start?: number })
          .current_period_start;
        return start ? new Date(start * 1000) : null;
      })(),
      metadataUserId: sub.metadata?.internalUserId ?? null,
    };
  }
}
