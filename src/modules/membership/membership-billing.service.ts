import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentProvider,
  Plan,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PAYMENT_PROVIDER } from './membership.tokens';
import {
  FuturePaymentWebhookEvent,
  type PaymentProviderPort,
} from './payment-provider.port';
import { PRO_MONTHLY_PRICE_THB } from './plan.config';
import { mapStripeSubscriptionStatus } from './stripe-status.mapper';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';

@Injectable()
export class MembershipBillingService {
  private readonly logger = new Logger(MembershipBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly entitlement: SubscriptionEntitlementService,
    @Inject(PAYMENT_PROVIDER)
    private readonly payments: PaymentProviderPort,
  ) {}

  paymentConfigured(): boolean {
    return this.payments.isConfigured();
  }

  async createCheckout(
    userId: string,
  ): Promise<{ url: string; sessionId: string }> {
    if (!this.payments.isConfigured()) {
      throw new Error('ระบบชำระเงินยังไม่พร้อม (Stripe TEST)');
    }

    const existing = await this.entitlement.getLatestSubscription(userId);
    const ent = this.entitlement.resolveEntitlement(existing);
    if (
      ent.hasProAccess &&
      this.entitlement.isPaidActivePro(existing) &&
      existing?.status === SubscriptionStatus.ACTIVE &&
      !existing.canceledAt
    ) {
      throw new Error('คุณมี Pro อยู่แล้วครับ');
    }

    const webBase = (this.config.get<string>('MEMBERSHIP_WEB_URL') ?? '')
      .trim()
      .replace(/\/$/, '');
    if (!webBase) {
      throw new Error('MEMBERSHIP_WEB_URL is required for checkout');
    }

    const result = await this.payments.createCheckoutSession({
      userId,
      priceThbMonthly: PRO_MONTHLY_PRICE_THB,
      providerCustomerId: existing?.providerCustomerId ?? undefined,
      successUrl: `${webBase}/membership/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${webBase}/membership/cancel`,
    });

    if (result.customerId) {
      await this.ensureStripeCustomerRow(userId, result.customerId);
    }

    this.logger.log(
      JSON.stringify({
        event: 'checkout_created',
        userIdPrefix: userId.slice(0, 8),
        sessionIdPrefix: result.sessionId.slice(0, 12),
      }),
    );

    return { url: result.url, sessionId: result.sessionId };
  }

  async cancel(userId: string): Promise<{ periodEnd: Date | null }> {
    const sub = await this.requirePaidStripeSub(userId);
    const snap = await this.payments.cancelSubscription(
      sub.providerSubscriptionId!,
    );
    await this.applyProviderSnapshot(userId, snap, true);
    return { periodEnd: snap.currentPeriodEnd };
  }

  async resume(userId: string): Promise<void> {
    const sub = await this.requirePaidStripeSub(userId);
    const snap = await this.payments.resumeSubscription(
      sub.providerSubscriptionId!,
    );
    await this.applyProviderSnapshot(userId, snap, false);
  }

  async handleVerifiedWebhook(params: {
    type: FuturePaymentWebhookEvent | 'ignored';
    data: unknown;
    providerEventId: string;
    stripeType: string;
  }): Promise<'processed' | 'duplicate' | 'ignored'> {
    try {
      await this.prisma.paymentEvent.create({
        data: {
          provider: PaymentProvider.STRIPE,
          providerEventId: params.providerEventId,
          eventType: params.stripeType,
          payloadSummary: JSON.stringify({
            type: params.type,
            stripeType: params.stripeType,
          }),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.log(
          JSON.stringify({
            event: 'payment_webhook_duplicate',
            providerEventId: params.providerEventId,
          }),
        );
        return 'duplicate';
      }
      throw error;
    }

    if (params.type === 'ignored') {
      return 'ignored';
    }

    await this.applyWebhookEvent(params.type, params.data);

    this.logger.log(
      JSON.stringify({
        event: 'payment_webhook_processed',
        type: params.type,
        providerEventId: params.providerEventId,
      }),
    );
    return 'processed';
  }

  private async applyWebhookEvent(
    type: FuturePaymentWebhookEvent,
    data: unknown,
  ): Promise<void> {
    const obj = data as Record<string, unknown>;

    if (type === 'checkout_completed') {
      const userId =
        (obj.client_reference_id as string | undefined) ||
        ((obj.metadata as { internalUserId?: string } | undefined)
          ?.internalUserId ??
          null);
      const customerId =
        typeof obj.customer === 'string'
          ? obj.customer
          : ((obj.customer as { id?: string } | null)?.id ?? null);
      const subscriptionId =
        typeof obj.subscription === 'string'
          ? obj.subscription
          : ((obj.subscription as { id?: string } | null)?.id ?? null);

      if (!userId || !subscriptionId) {
        this.logger.warn('checkout_completed missing userId/subscriptionId');
        return;
      }

      const snap = await this.payments.getSubscription(subscriptionId);
      if (!snap) {
        await this.upsertPaidSubscription(userId, {
          providerCustomerId: customerId,
          providerSubscriptionId: subscriptionId,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(),
          currentPeriodEnd: null,
        });
        return;
      }
      await this.applyProviderSnapshot(userId, snap, snap.cancelAtPeriodEnd);
      return;
    }

    if (
      type === 'subscription_created' ||
      type === 'subscription_updated' ||
      type === 'subscription_canceled'
    ) {
      const subscriptionId = obj.id as string | undefined;
      if (!subscriptionId) return;
      const snap = await this.payments.getSubscription(subscriptionId);
      if (!snap) return;
      const userId =
        snap.metadataUserId ||
        (await this.findUserIdByProviderIds(
          snap.providerCustomerId,
          subscriptionId,
        ));
      if (!userId) {
        this.logger.warn(
          `subscription event without mapped user sub=${subscriptionId}`,
        );
        return;
      }
      const forceCancel =
        type === 'subscription_canceled' || snap.cancelAtPeriodEnd;
      await this.applyProviderSnapshot(userId, snap, forceCancel);
      return;
    }

    if (type === 'invoice_paid' || type === 'invoice_payment_failed') {
      const subscriptionId =
        typeof obj.subscription === 'string'
          ? obj.subscription
          : ((obj.subscription as { id?: string } | null)?.id ?? null);
      if (!subscriptionId) return;
      const snap = await this.payments.getSubscription(subscriptionId);
      if (!snap) return;
      const userId =
        snap.metadataUserId ||
        (await this.findUserIdByProviderIds(
          snap.providerCustomerId,
          subscriptionId,
        ));
      if (!userId) return;
      if (type === 'invoice_payment_failed') {
        await this.upsertPaidSubscription(userId, {
          providerCustomerId: snap.providerCustomerId,
          providerSubscriptionId: subscriptionId,
          status: SubscriptionStatus.PAST_DUE,
          currentPeriodStart: snap.currentPeriodStart,
          currentPeriodEnd: snap.currentPeriodEnd,
        });
        return;
      }
      await this.applyProviderSnapshot(userId, snap, snap.cancelAtPeriodEnd);
    }
  }

  private async applyProviderSnapshot(
    userId: string,
    snap: {
      providerSubscriptionId: string;
      providerCustomerId: string;
      status: string;
      currentPeriodStart: Date | null;
      currentPeriodEnd: Date | null;
      cancelAtPeriodEnd: boolean;
    },
    cancelAtPeriodEnd: boolean,
  ): Promise<void> {
    let status = mapStripeSubscriptionStatus(snap.status);
    if (cancelAtPeriodEnd && status === SubscriptionStatus.ACTIVE) {
      status = SubscriptionStatus.CANCELED;
    }
    await this.upsertPaidSubscription(userId, {
      providerCustomerId: snap.providerCustomerId || null,
      providerSubscriptionId: snap.providerSubscriptionId,
      status,
      currentPeriodStart: snap.currentPeriodStart,
      currentPeriodEnd: snap.currentPeriodEnd,
      canceledAt:
        status === SubscriptionStatus.CANCELED || cancelAtPeriodEnd
          ? new Date()
          : null,
    });
  }

  private async upsertPaidSubscription(
    userId: string,
    data: {
      providerCustomerId: string | null;
      providerSubscriptionId: string;
      status: SubscriptionStatus;
      currentPeriodStart: Date | null;
      currentPeriodEnd: Date | null;
      canceledAt?: Date | null;
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.subscription.findFirst({
        where: {
          OR: [
            { providerSubscriptionId: data.providerSubscriptionId },
            {
              userId,
              provider: PaymentProvider.STRIPE,
              status: {
                in: [
                  SubscriptionStatus.ACTIVE,
                  SubscriptionStatus.TRIALING,
                  SubscriptionStatus.CANCELED,
                  SubscriptionStatus.PAST_DUE,
                ],
              },
            },
          ],
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (existing) {
        await tx.subscription.update({
          where: { id: existing.id },
          data: {
            userId,
            plan: Plan.PRO,
            status: data.status,
            provider: PaymentProvider.STRIPE,
            providerCustomerId: data.providerCustomerId,
            providerSubscriptionId: data.providerSubscriptionId,
            startedAt: existing.startedAt ?? new Date(),
            currentPeriodStart: data.currentPeriodStart,
            currentPeriodEnd: data.currentPeriodEnd,
            canceledAt: data.canceledAt ?? existing.canceledAt,
          },
        });
        return;
      }

      await tx.subscription.create({
        data: {
          userId,
          plan: Plan.PRO,
          status: data.status,
          provider: PaymentProvider.STRIPE,
          providerCustomerId: data.providerCustomerId,
          providerSubscriptionId: data.providerSubscriptionId,
          startedAt: new Date(),
          currentPeriodStart: data.currentPeriodStart,
          currentPeriodEnd: data.currentPeriodEnd,
          canceledAt: data.canceledAt ?? null,
        },
      });
    });
  }

  private async ensureStripeCustomerRow(
    userId: string,
    customerId: string,
  ): Promise<void> {
    const latest = await this.entitlement.getLatestSubscription(userId);
    if (latest?.providerCustomerId === customerId) return;
    if (
      latest &&
      latest.provider === PaymentProvider.STRIPE &&
      !latest.providerCustomerId
    ) {
      await this.prisma.subscription.update({
        where: { id: latest.id },
        data: { providerCustomerId: customerId },
      });
    }
  }

  private async findUserIdByProviderIds(
    customerId: string,
    subscriptionId: string,
  ): Promise<string | null> {
    const bySub = await this.prisma.subscription.findFirst({
      where: { providerSubscriptionId: subscriptionId },
    });
    if (bySub) return bySub.userId;
    if (!customerId) return null;
    const byCustomer = await this.prisma.subscription.findFirst({
      where: { providerCustomerId: customerId },
      orderBy: { updatedAt: 'desc' },
    });
    return byCustomer?.userId ?? null;
  }

  private async requirePaidStripeSub(userId: string) {
    const sub = await this.entitlement.getLatestSubscription(userId);
    if (
      !sub ||
      sub.provider !== PaymentProvider.STRIPE ||
      !sub.providerSubscriptionId
    ) {
      throw new Error('ไม่พบสมาชิกที่ชำระเงินแล้ว');
    }
    return sub;
  }
}
