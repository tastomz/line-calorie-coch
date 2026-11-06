import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  RawBody,
  ServiceUnavailableException,
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

    let body: LineWebhookBody;
    try {
      body = JSON.parse(rawBody.toString('utf8')) as LineWebhookBody;
      if (!Array.isArray(body?.events)) {
        throw new Error('Missing events array');
      }
    } catch {
      throw new BadRequestException('Invalid LINE payload');
    }

    try {
      await this.lineWebhookService.handleWebhookBody(body);
    } catch (error) {
      // The durable claim did not complete: return a retryable 503, not 200.
      // A replay is harmless because lineEventId has a DB unique constraint.
      this.logger.error(
        'LINE event acceptance failed: ' +
          (error instanceof Error ? error.name : 'unknown'),
      );
      throw new ServiceUnavailableException('LINE event was not accepted');
    }
    return { ok: true };
  }
}
