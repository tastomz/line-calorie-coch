/**
 * Payment provider abstraction.
 * Stripe TEST mode is supported; LIVE payment is NOT active.
 * Never trust client-side "payment successful" messages.
 */

export type CheckoutSessionRequest = {
  userId: string;
  successUrl: string;
  cancelUrl: string;
  /** Monthly price in THB — must match PRO_MONTHLY_PRICE_THB. */
  priceThbMonthly: number;
  /** Existing Stripe customer id when known. */
  providerCustomerId?: string;
};

export type CheckoutSessionResult = {
  sessionId: string;
  url: string;
  customerId?: string;
};

export type ProviderSubscriptionSnapshot = {
  providerSubscriptionId: string;
  providerCustomerId: string;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  metadataUserId?: string | null;
};

/**
 * Normalized webhook event names.
 * checkout.session.completed
 * customer.subscription.created
 * customer.subscription.updated
 * customer.subscription.deleted
 * invoice.paid
 * invoice.payment_failed
 */
export type FuturePaymentWebhookEvent =
  | 'checkout_completed'
  | 'subscription_created'
  | 'subscription_updated'
  | 'subscription_canceled'
  | 'invoice_paid'
  | 'invoice_payment_failed';

export interface PaymentProviderPort {
  isConfigured(): boolean;
  createCustomer(
    userId: string,
    email?: string,
  ): Promise<{ customerId: string }>;
  createCheckoutSession(
    request: CheckoutSessionRequest,
  ): Promise<CheckoutSessionResult>;
  getSubscription(
    providerSubscriptionId: string,
  ): Promise<ProviderSubscriptionSnapshot | null>;
  cancelSubscription(
    providerSubscriptionId: string,
  ): Promise<ProviderSubscriptionSnapshot>;
  resumeSubscription(
    providerSubscriptionId: string,
  ): Promise<ProviderSubscriptionSnapshot>;
  /**
   * Verify provider signature and parse payload.
   * Must reject unsigned / invalid webhooks.
   */
  verifyAndParseWebhook(
    rawBody: Buffer,
    signatureHeader: string | undefined,
  ): Promise<{
    type: FuturePaymentWebhookEvent | 'ignored';
    data: unknown;
    providerEventId: string;
    stripeType: string;
  }>;
}

/** Stub when Stripe TEST env vars are absent. */
export class UnimplementedPaymentProvider implements PaymentProviderPort {
  isConfigured(): boolean {
    return false;
  }

  private fail(): never {
    throw new Error(
      'Payment processing is not configured. Set Stripe TEST keys. See docs/MEMBERSHIP.md.',
    );
  }

  createCustomer(): Promise<{ customerId: string }> {
    this.fail();
  }
  createCheckoutSession(): Promise<CheckoutSessionResult> {
    this.fail();
  }
  getSubscription(): Promise<ProviderSubscriptionSnapshot | null> {
    this.fail();
  }
  cancelSubscription(): Promise<ProviderSubscriptionSnapshot> {
    this.fail();
  }
  resumeSubscription(): Promise<ProviderSubscriptionSnapshot> {
    this.fail();
  }
  verifyAndParseWebhook(): Promise<{
    type: FuturePaymentWebhookEvent | 'ignored';
    data: unknown;
    providerEventId: string;
    stripeType: string;
  }> {
    this.fail();
  }
}
