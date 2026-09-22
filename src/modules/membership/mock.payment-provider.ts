import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PRO_MONTHLY_PRICE_THB } from './plan.config';
import {
  CheckoutSessionRequest,
  CheckoutSessionResult,
  FuturePaymentWebhookEvent,
  PaymentProviderPort,
  ProviderSubscriptionSnapshot,
} from './payment-provider.port';

type MockSession = {
  sessionId: string;
  userId: string;
  customerId: string;
  subscriptionId: string;
  createdAt: number;
};

/**
 * Development mock payment provider.
 * Used when PAYMENT_MODE=MOCK (default when Stripe TEST is not configured).
 * Does not talk to Stripe. Events are applied via MembershipBillingService.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProviderPort {
  private readonly logger = new Logger(MockPaymentProvider.name);
  private readonly sessions = new Map<string, MockSession>();
  private readonly subscriptions = new Map<
    string,
    ProviderSubscriptionSnapshot
  >();

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return true;
  }

  createCustomer(userId: string): Promise<{ customerId: string }> {
    return Promise.resolve({ customerId: `cus_mock_${userId.slice(0, 8)}` });
  }

  async createCheckoutSession(
    request: CheckoutSessionRequest,
  ): Promise<CheckoutSessionResult> {
    if (request.priceThbMonthly !== PRO_MONTHLY_PRICE_THB) {
      throw new Error(
        `Checkout price must be ${PRO_MONTHLY_PRICE_THB} THB/month`,
      );
    }
    const sessionId = `cs_mock_${randomBytes(8).toString('hex')}`;
    const customerId =
      request.providerCustomerId ??
      (await this.createCustomer(request.userId)).customerId;
    const subscriptionId = `sub_mock_${randomBytes(8).toString('hex')}`;
    this.sessions.set(sessionId, {
      sessionId,
      userId: request.userId,
      customerId,
      subscriptionId,
      createdAt: Date.now(),
    });

    const webBase = (
      this.config.get<string>('MEMBERSHIP_WEB_URL') ?? 'http://localhost:3000'
    )
      .trim()
      .replace(/\/$/, '');
    const url = `${webBase}/membership/mock-checkout?session_id=${sessionId}`;
    this.logger.log(
      JSON.stringify({
        event: 'mock_checkout_created',
        sessionIdPrefix: sessionId.slice(0, 12),
        userIdPrefix: request.userId.slice(0, 8),
      }),
    );
    return { sessionId, url, customerId };
  }

  getSession(sessionId: string): MockSession | undefined {
    return this.sessions.get(sessionId);
  }

  getSubscription(
    providerSubscriptionId: string,
  ): Promise<ProviderSubscriptionSnapshot | null> {
    return Promise.resolve(
      this.subscriptions.get(providerSubscriptionId) ?? null,
    );
  }

  cancelSubscription(
    providerSubscriptionId: string,
  ): Promise<ProviderSubscriptionSnapshot> {
    const existing = this.subscriptions.get(providerSubscriptionId);
    const periodEnd =
      existing?.currentPeriodEnd ??
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const snap: ProviderSubscriptionSnapshot = {
      providerSubscriptionId,
      providerCustomerId: existing?.providerCustomerId ?? 'cus_mock',
      status: 'active',
      currentPeriodStart: existing?.currentPeriodStart ?? new Date(),
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: true,
      metadataUserId: existing?.metadataUserId ?? null,
    };
    this.subscriptions.set(providerSubscriptionId, snap);
    return Promise.resolve(snap);
  }

  resumeSubscription(
    providerSubscriptionId: string,
  ): Promise<ProviderSubscriptionSnapshot> {
    const existing = this.subscriptions.get(providerSubscriptionId);
    if (!existing) {
      return Promise.reject(new Error('mock subscription not found'));
    }
    const snap: ProviderSubscriptionSnapshot = {
      ...existing,
      cancelAtPeriodEnd: false,
      status: 'active',
    };
    this.subscriptions.set(providerSubscriptionId, snap);
    return Promise.resolve(snap);
  }

  /** Simulate a paid success for a checkout session. */
  simulatePaymentSuccess(sessionId: string): {
    type: FuturePaymentWebhookEvent;
    data: unknown;
    providerEventId: string;
    stripeType: string;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('mock session not found');
    }
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const snap: ProviderSubscriptionSnapshot = {
      providerSubscriptionId: session.subscriptionId,
      providerCustomerId: session.customerId,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      metadataUserId: session.userId,
    };
    this.subscriptions.set(session.subscriptionId, snap);
    return {
      type: 'checkout_completed',
      providerEventId: `evt_mock_${randomBytes(8).toString('hex')}`,
      stripeType: 'checkout.session.completed',
      data: {
        id: session.sessionId,
        client_reference_id: session.userId,
        customer: session.customerId,
        subscription: session.subscriptionId,
        metadata: { internalUserId: session.userId },
      },
    };
  }

  simulateOutcome(
    sessionId: string,
    outcome: 'success' | 'fail' | 'past_due' | 'cancel',
  ): {
    type: FuturePaymentWebhookEvent | 'ignored';
    data: unknown;
    providerEventId: string;
    stripeType: string;
  } {
    if (outcome === 'success') {
      return this.simulatePaymentSuccess(sessionId);
    }
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('mock session not found');
    if (outcome === 'fail') {
      return {
        type: 'invoice_payment_failed',
        providerEventId: `evt_mock_${randomBytes(8).toString('hex')}`,
        stripeType: 'invoice.payment_failed',
        data: { subscription: session.subscriptionId },
      };
    }
    if (outcome === 'past_due') {
      const snap: ProviderSubscriptionSnapshot = {
        providerSubscriptionId: session.subscriptionId,
        providerCustomerId: session.customerId,
        status: 'past_due',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        metadataUserId: session.userId,
      };
      this.subscriptions.set(session.subscriptionId, snap);
      return {
        type: 'subscription_updated',
        providerEventId: `evt_mock_${randomBytes(8).toString('hex')}`,
        stripeType: 'customer.subscription.updated',
        data: { id: session.subscriptionId },
      };
    }
    // cancel
    return {
      type: 'ignored',
      providerEventId: `evt_mock_${randomBytes(8).toString('hex')}`,
      stripeType: 'checkout.session.expired',
      data: { id: sessionId },
    };
  }

  verifyAndParseWebhook(): Promise<{
    type: FuturePaymentWebhookEvent | 'ignored';
    data: unknown;
    providerEventId: string;
    stripeType: string;
  }> {
    return Promise.reject(
      new Error('Mock provider does not accept Stripe webhooks'),
    );
  }
}
