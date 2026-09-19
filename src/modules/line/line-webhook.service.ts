import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hashLineUserId, logEvent } from '../../common/structured-log';
import {
  WEBHOOK_EVENT_BUDGET_MS,
  withTimeout,
} from '../../common/with-timeout';
import { PrismaService } from '../../prisma/prisma.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { LineOutboundError } from './line-outbound.error';
import { LineWebhookBody, LineWebhookEvent } from './line.types';

/**
 * Webhook reliability (Phase 7):
 *
 * 1. Verify signature (controller) → parse body → claim each event durably.
 * 2. HTTP 200 is returned only after durable claims (controller awaits claim phase).
 * 3. Business processing runs in-process with a per-event time budget.
 * 4. Once mutation work completes, LineEvent claim is NEVER released merely
 *    because LINE reply failed (LineOutboundError).
 * 5. Duplicate webhookEventId deliveries skip processing (idempotent).
 *
 * V1 does not use an external queue — in-process background work is enough
 * provided claims are durable and OpenAI calls are timed out.
 */
@Injectable()
export class LineWebhookService {
  private readonly logger = new Logger(LineWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly onboardingService: OnboardingService,
  ) {}

  /**
   * Claim all events durably, then process them under budget.
   * Caller (controller) should await this so HTTP 200 follows claims.
   */
  async handleWebhookBody(body: LineWebhookBody): Promise<void> {
    const events = Array.isArray(body?.events) ? body.events : [];
    this.logger.log(
      `Webhook accepted events=${events.length} destinationPresent=${Boolean(body?.destination)}`,
    );

    const claimed: LineWebhookEvent[] = [];
    for (const event of events) {
      const lineEventId = this.resolveEventId(event);
      const eventType = event.type ?? 'unknown';
      const ok = await this.claimEvent(lineEventId, eventType);
      if (!ok) {
        this.logger.warn(
          `Skipping duplicate LINE event type=${eventType} eventId=${lineEventId}`,
        );
        continue;
      }
      claimed.push(event);
    }

    // Process after durable claims. Failures are logged per-event.
    await Promise.allSettled(
      claimed.map((event) => this.processClaimedEvent(event)),
    );
  }

  async handleEvent(
    event: LineWebhookEvent,
  ): Promise<'processed' | 'duplicate' | 'ignored'> {
    const lineEventId = this.resolveEventId(event);
    const eventType = event.type ?? 'unknown';

    const claimed = await this.claimEvent(lineEventId, eventType);
    if (!claimed) {
      this.logger.warn(
        `Skipping duplicate LINE event type=${eventType} eventId=${lineEventId}`,
      );
      return 'duplicate';
    }

    return this.processClaimedEvent(event);
  }

  private async processClaimedEvent(
    event: LineWebhookEvent,
  ): Promise<'processed' | 'ignored'> {
    const lineEventId = this.resolveEventId(event);
    const eventType = event.type ?? 'unknown';
    const started = Date.now();

    try {
      await withTimeout(
        this.dispatchEvent(event),
        WEBHOOK_EVENT_BUDGET_MS,
        `webhook event ${eventType}`,
      );
      const result =
        event.type === 'follow' || event.type === 'message'
          ? 'processed'
          : 'ignored';
      logEvent(this.logger, 'log', {
        event: 'webhook_event_done',
        lineEventId,
        lineUserKey: event.source?.userId
          ? hashLineUserId(event.source.userId)
          : undefined,
        durationMs: Date.now() - started,
        result,
      });
      return result;
    } catch (error) {
      if (error instanceof LineOutboundError) {
        logEvent(this.logger, 'warn', {
          event: 'webhook_outbound_failed',
          lineEventId,
          errorCategory: 'line_outbound',
          durationMs: Date.now() - started,
        });
        return 'processed';
      }

      logEvent(this.logger, 'error', {
        event: 'webhook_event_failed',
        lineEventId,
        errorCategory: 'processing',
        durationMs: Date.now() - started,
      });
      await this.releaseEvent(lineEventId);
      return 'ignored';
    }
  }

  private async dispatchEvent(event: LineWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'follow':
        await this.handleFollow(event);
        return;
      case 'message':
        await this.handleMessage(event);
        return;
      default:
        this.logger.log(
          `Ignoring unsupported LINE event type: ${event.type ?? 'unknown'}`,
        );
    }
  }

  resolveEventId(event: LineWebhookEvent): string {
    if (event.webhookEventId) {
      return event.webhookEventId;
    }

    const userId = event.source?.userId ?? 'unknown';
    const messageId = event.message?.id ?? event.replyToken ?? 'none';
    return `${event.type}:${event.timestamp ?? 0}:${userId}:${messageId}`;
  }

  private async claimEvent(
    lineEventId: string,
    eventType: string,
  ): Promise<boolean> {
    try {
      await this.prisma.lineEvent.create({
        data: { lineEventId, eventType },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }

  private async releaseEvent(lineEventId: string): Promise<void> {
    try {
      await this.prisma.lineEvent.delete({ where: { lineEventId } });
      this.logger.warn(`Released LineEvent claim eventId=${lineEventId}`);
    } catch (error) {
      this.logger.warn(
        `Failed to release LineEvent claim eventId=${lineEventId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private async handleFollow(event: LineWebhookEvent): Promise<void> {
    const lineUserId = event.source?.userId;
    const replyToken = event.replyToken;
    if (!lineUserId || !replyToken) {
      this.logger.warn('Follow event missing userId or replyToken');
      return;
    }
    this.logger.log(
      `Routing follow event eventId=${this.resolveEventId(event)} userIdPresent=true`,
    );
    await this.onboardingService.handleFollow(lineUserId, replyToken);
  }

  private async handleMessage(event: LineWebhookEvent): Promise<void> {
    const lineUserId = event.source?.userId;
    const replyToken = event.replyToken;
    if (!lineUserId || !replyToken) {
      this.logger.warn('Message event missing userId or replyToken');
      return;
    }

    if (event.message?.type === 'image') {
      const messageId = event.message.id;
      if (!messageId) {
        this.logger.warn('Image message missing message id');
        return;
      }
      this.logger.log(
        `Routing image message eventId=${this.resolveEventId(event)} userIdPresent=true`,
      );
      await this.onboardingService.handleImageMessage(
        lineUserId,
        replyToken,
        messageId,
      );
      return;
    }

    if (event.message?.type !== 'text') {
      this.logger.log(`Ignoring non-text message type: ${event.message?.type}`);
      return;
    }

    this.logger.log(
      `Routing text message eventId=${this.resolveEventId(event)} userIdPresent=true textLength=${(event.message.text ?? '').length}`,
    );
    await this.onboardingService.handleTextMessage(
      lineUserId,
      replyToken,
      event.message.text ?? '',
    );
  }
}
