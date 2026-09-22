import {
  Controller,
  Headers,
  HttpCode,
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

    try {
      const parsed = await this.payments.verifyAndParseWebhook(
        rawBody,
        signature,
      );
      this.logger.log(
        JSON.stringify({
          event: 'payment_webhook_received',
          stripeType: parsed.stripeType,
          providerEventId: parsed.providerEventId,
        }),
      );
      const result = await this.billing.handleVerifiedWebhook(parsed);
      return { received: true, result };
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'payment_webhook_rejected',
          reason: error instanceof Error ? error.message : 'unknown',
        }),
      );
      throw new UnauthorizedException('invalid webhook');
    }
  }
}
