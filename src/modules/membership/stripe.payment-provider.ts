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

/**
 * Stripe adapter — TEST/SANDBOX keys only (`sk_test_…`).
 * Live keys (`sk_live_…`) are rejected.
 * PAYMENT LIVE = NOT ACTIVE.
 */
@Injectable()
export class StripePaymentProvider implements PaymentProviderPort {
  private readonly logger = new Logger(StripePaymentProvider.name);
  private readonly client: Stripe | null;
  private readonly webhookSecret: string;
  private readonly priceId: string;

  constructor(private readonly config: ConfigService) {
    const secret = (this.config.get<string>('STRIPE_SECRET_KEY') ?? '').trim();
    this.webhookSecret = (
      this.config.get<string>('STRIPE_WEBHOOK_SECRET') ?? ''
    ).trim();
    this.priceId = (this.config.get<string>('STRIPE_PRICE_ID') ?? '').trim();

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
    return this.client !== null && this.priceId.length > 0;
  }

  private requireClient(): Stripe {
    if (!this.client) {
      throw new Error(
        'Stripe TEST mode is not configured (STRIPE_SECRET_KEY / STRIPE_PRICE_ID)',
      );
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
    if (!this.priceId) {
      throw new Error('STRIPE_PRICE_ID is required');
    }
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

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: this.priceId, quantity: 1 }],
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      client_reference_id: request.userId,
      metadata: { internalUserId: request.userId },
      subscription_data: {
        metadata: { internalUserId: request.userId },
      },
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
      case 'checkout.session.completed':
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
