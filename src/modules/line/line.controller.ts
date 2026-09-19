import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  RawBody,
  UnauthorizedException,
} from '@nestjs/common';
import { LineWebhookService } from './line-webhook.service';
import { LineService } from './line.service';
import { LineWebhookBody } from './line.types';

@Controller('line')
export class LineController {
  private readonly logger = new Logger(LineController.name);

  constructor(
    private readonly lineService: LineService,
    private readonly lineWebhookService: LineWebhookService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @RawBody() rawBody: Buffer | undefined,
    @Headers('x-line-signature') signature?: string,
  ) {
    // LINE signs the exact raw request bytes. Never verify against
    // JSON.parse → JSON.stringify output (whitespace/key-order drift → false 401s).
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      this.logger.error(
        'LINE webhook raw body is unavailable; ensure NestFactory.create(..., { rawBody: true })',
      );
      throw new UnauthorizedException('Invalid LINE signature');
    }

    if (!this.lineService.verifySignature(rawBody, signature)) {
      this.logger.warn('LINE webhook signature verification failed');
      throw new UnauthorizedException('Invalid LINE signature');
    }

    this.logger.log(
      `LINE webhook signature ok bytes=${rawBody.length} signaturePresent=${Boolean(signature)}`,
    );

    try {
      const body = JSON.parse(rawBody.toString('utf8')) as LineWebhookBody;
      await this.lineWebhookService.handleWebhookBody(body);
    } catch (error) {
      // Signature was valid — acknowledge to avoid endless LINE retries on poison events.
      this.logger.error(
        `Webhook processing error: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    return { ok: true };
  }
}
