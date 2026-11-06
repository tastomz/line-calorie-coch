import {
  Controller,
  Headers,
  HttpCode,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Inject } from '@nestjs/common';
import { MembershipBillingService } from './membership-billing.service';
import { PAYMENT_PROVIDER } from './membership.tokens';
import type { PaymentProviderPort } from './payment-provider.port';

@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly billing: MembershipBillingService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProviderPort,
  ) {}

  @Post('stripe')
  @HttpCode(200)
  async handleStripe(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.error(
        JSON.stringify({
          event: 'payment_webhook_rejected',
          reason: 'missing_raw_body',
        }),
      );
      throw new UnauthorizedException('raw body required');
    }

    let parsed: Awaited<ReturnType<PaymentProviderPort['verifyAndParseWebhook']>>;
    try {
      parsed = await this.payments.verifyAndParseWebhook(rawBody, signature);
    } catch {
      this.logger.warn(
        JSON.stringify({
          event: 'payment_webhook_rejected',
          reason: 'invalid_signature_or_payload',
        }),
      );
      throw new UnauthorizedException('invalid webhook');
    }
    this.logger.log(
      JSON.stringify({
        event: 'payment_webhook_received',
        stripeType: parsed.stripeType,
        providerEventId: parsed.providerEventId,
      }),
    );
    try {
      const result = await this.billing.handleVerifiedWebhook(parsed);
      return { received: true, result };
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'payment_webhook_processing_failed',
          providerEventId: parsed.providerEventId,
          errorCategory: error instanceof Error ? error.name : 'unknown',
        }),
      );
      // Return 5xx for verified events that failed to apply; Stripe will retry.
      throw new InternalServerErrorException('webhook processing failed');
    }
  }
}
