import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { withLineEventContext } from '../../common/line-event-context';
import { hashLineUserId, logEvent } from '../../common/structured-log';
import { LINE_LOADING_SECONDS } from '../../common/with-timeout';
import { PrismaService } from '../../prisma/prisma.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { LineOutboundError } from './line-outbound.error';
import { LineService } from './line.service';
import { LineWebhookBody, LineWebhookEvent } from './line.types';

type QueueRow = {
  id: string;
  lineEventId: string;
  eventType: string;
  payload: string | null;
  userKey: string | null;
  status: string;
  attemptCount: number;
  createdAt: Date;
  leasedUntil: Date | null;
};

const PROCESSING_LEASE_MS = 180_000;
const MAX_ATTEMPTS = 6;
const MAX_CONCURRENT_USERS = 4;
const PENDING_STATUSES = ['PENDING', 'PROCESSING', 'FAILED'];

@Injectable()
export class LineWebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LineWebhookService.name);
  private readonly workerId = randomUUID();
  private readonly activeUsers = new Set<string>();
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private polling = false;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly onboardingService: OnboardingService,
    @Optional() private readonly lineService?: LineService,
  ) {}

  onModuleInit(): void {
    this.stopped = false;
    this.pollTimer = setInterval(() => {
      void this.poll();
    }, 1000);
    this.pollTimer.unref();
    void this.poll();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    // In-progress rows retain their leases for restart recovery.
  }

  private async isAdminChatActive(lineUserId: string): Promise<boolean> {
    try {
      return await this.onboardingService.isAdminChatActive(lineUserId);
    } catch {
      return false;
    }
  }

  private startLoading(event: LineWebhookEvent): void {
    const userId = event.source?.userId;
    if (!this.lineService || !userId || event.source?.type !== 'user') return;
    void this.lineService.showLoadingAnimation(userId, LINE_LOADING_SECONDS);
  }

  /**
   * Persist verified LINE events before acknowledging HTTP 200. Processing
   * happens independently of the request so AI latency cannot hold the webhook.
   */
  async handleWebhookBody(body: LineWebhookBody): Promise<void> {
    const events = Array.isArray(body?.events) ? body.events : [];
    this.logger.log(
      'Webhook accepted events=' +
        events.length +
        ' destinationPresent=' +
        Boolean(body?.destination),
    );
    for (const event of events) {
      const claimed = await this.claimEvent(event);
      if (!claimed) {
        this.logger.log('Skipping duplicate LINE event');
      }
    }
    // Do not await the worker inside a webhook HTTP request.
    void this.poll();
  }

  /** Direct test/maintenance entry point, using the same durable claim path. */
  async handleEvent(
    event: LineWebhookEvent,
  ): Promise<'processed' | 'duplicate' | 'ignored'> {
    const claimed = await this.claimEvent(event);
    if (!claimed) return 'duplicate';
    const row = await this.prisma.lineEvent.findUnique({
      where: { lineEventId: this.resolveEventId(event) },
    });
    if (!row) throw new Error('Persisted LINE event not found');
    return this.processQueuedEvent(row, event);
  }

  /** Public for isolated worker tests and manual recovery in development. */
  async drainOnce(): Promise<void> {
    await this.poll();
  }

  private async poll(): Promise<void> {
    if (
      this.stopped ||
      this.polling ||
      this.activeUsers.size >= MAX_CONCURRENT_USERS
    ) {
      return;
    }
    this.polling = true;
    try {
      const now = new Date();
      const candidates = await this.prisma.lineEvent.findMany({
        where: {
          OR: [
            { status: 'PENDING' },
            { status: 'FAILED', nextAttemptAt: { lte: now } },
            { status: 'PROCESSING', leasedUntil: { lt: now } },
          ],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 40,
      });
      for (const row of candidates) {
        if (this.stopped || this.activeUsers.size >= MAX_CONCURRENT_USERS) {
          break;
        }
        const key = row.userKey ?? row.lineEventId;
        if (this.activeUsers.has(key)) continue;
        if (row.userKey) {
          const earlier = await this.prisma.lineEvent.count({
            where: {
              userKey: row.userKey,
              createdAt: { lt: row.createdAt },
              status: { in: PENDING_STATUSES },
            },
          });
          if (earlier > 0) continue;
        }
        this.activeUsers.add(key);
        void this.processQueuedEvent(row).finally(() => {
          this.activeUsers.delete(key);
          if (!this.stopped) void this.poll();
        });
      }
    } catch (error) {
      this.logger.error(
        'LINE queue polling failed: ' +
          (error instanceof Error ? error.name : 'unknown'),
      );
    } finally {
      this.polling = false;
    }
  }

  private async processQueuedEvent(
    row: QueueRow,
    originalEvent?: LineWebhookEvent,
  ): Promise<'processed' | 'ignored'> {
    const now = new Date();
    const claim = await this.prisma.lineEvent.updateMany({
      where: {
        id: row.id,
        status: row.status,
        ...(row.status === 'PROCESSING'
          ? { leasedUntil: { lt: now } }
          : row.status === 'FAILED'
            ? { nextAttemptAt: { lte: now } }
            : {}),
      },
      data: {
        status: 'PROCESSING',
        attemptCount: { increment: 1 },
        workerId: this.workerId,
        leasedUntil: new Date(now.getTime() + PROCESSING_LEASE_MS),
        lastError: null,
      },
    });
    if (claim.count !== 1) return 'ignored';

    const heartbeat = setInterval(() => {
      void this.prisma.lineEvent
        .updateMany({
          where: {
            id: row.id,
            status: 'PROCESSING',
            workerId: this.workerId,
          },
          data: {
            leasedUntil: new Date(Date.now() + PROCESSING_LEASE_MS),
          },
        })
        .catch(() => this.logger.warn('LINE worker lease renewal failed'));
    }, 15_000);
    heartbeat.unref();
    const started = Date.now();
    try {
      const event =
        originalEvent ??
        (JSON.parse(row.payload ?? 'null') as LineWebhookEvent | null);
      if (!event || typeof event.type !== 'string') {
        throw new Error('Invalid queued LINE event payload');
      }

      // Do not race the underlying mutation with a Promise timeout wrapper.
      await withLineEventContext(row.lineEventId, () =>
        this.dispatchEvent(event),
      );
      const result =
        event.type === 'follow' ||
        event.type === 'message' ||
        event.type === 'postback'
          ? 'processed'
          : 'ignored';
      await this.markCompleted(row.id);
      logEvent(this.logger, 'log', {
        event: 'webhook_event_done',
        lineEventId: row.lineEventId,
        lineUserKey: event.source?.userId
          ? hashLineUserId(event.source.userId)
          : undefined,
        durationMs: Date.now() - started,
        result,
      });
      return result;
    } catch (error) {
      if (error instanceof LineOutboundError) {
        // A reply failure must never trigger a second business mutation.
        await this.markCompleted(row.id);
        logEvent(this.logger, 'warn', {
          event: 'webhook_outbound_failed',
          lineEventId: row.lineEventId,
          errorCategory: 'line_outbound',
          durationMs: Date.now() - started,
        });
        return 'processed';
      }

      const attempts = row.attemptCount + 1;
      const terminal = attempts >= MAX_ATTEMPTS;
      const backoffMs = Math.min(300_000, 2000 * 2 ** (attempts - 1));
      await this.prisma.lineEvent.updateMany({
        where: {
          id: row.id,
          status: 'PROCESSING',
          workerId: this.workerId,
        },
        data: {
          status: terminal ? 'DEAD' : 'FAILED',
          leasedUntil: null,
          workerId: null,
          nextAttemptAt: terminal ? null : new Date(Date.now() + backoffMs),
          lastError: error instanceof Error ? error.name : 'unknown',
        },
      });
      logEvent(this.logger, 'error', {
        event: terminal ? 'webhook_event_dead' : 'webhook_event_retry',
        lineEventId: row.lineEventId,
        errorCategory: 'processing',
        durationMs: Date.now() - started,
      });
      return 'ignored';
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async markCompleted(id: string): Promise<void> {
    await this.prisma.lineEvent.updateMany({
      where: { id, status: 'PROCESSING', workerId: this.workerId },
      data: {
        status: 'COMPLETED',
        leasedUntil: null,
        workerId: null,
        nextAttemptAt: null,
        lastError: null,
        processedAt: new Date(),
      },
    });
  }

  private async dispatchEvent(event: LineWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'follow':
        await this.handleFollow(event);
        return;
      case 'message':
        await this.handleMessage(event);
        return;
      case 'postback':
        await this.handlePostback(event);
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

  private async claimEvent(event: LineWebhookEvent): Promise<boolean> {
    try {
      await this.prisma.lineEvent.create({
        data: {
          lineEventId: this.resolveEventId(event),
          eventType: event.type ?? 'unknown',
          payload: JSON.stringify(event),
          userKey: event.source?.userId ?? null,
          status: 'PENDING',
          nextAttemptAt: new Date(),
        },
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

    if (
      (event.message?.type === 'image' || event.message?.type === 'text') &&
      !(await this.isAdminChatActive(lineUserId))
    ) {
      // No typing dots while an admin is handling the chat.
      this.startLoading(event);
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

  /**
   * Postback buttons (e.g. foodedit:* commands) carry their command in
   * `data`, invisible to the chat — unlike a message action, LINE does not
   * echo it as a user-typed bubble. Routed through the same text handler
   * since every command parser (parseFoodEditCommand, etc.) only cares
   * about the string, not which event type carried it.
   */
  private async handlePostback(event: LineWebhookEvent): Promise<void> {
    const lineUserId = event.source?.userId;
    const replyToken = event.replyToken;
    if (!lineUserId || !replyToken) {
      this.logger.warn('Postback event missing userId or replyToken');
      return;
    }

    const data = event.postback?.data ?? '';
    if (!data) {
      this.logger.warn('Postback event missing data');
      return;
    }

    this.logger.log(
      `Routing postback eventId=${this.resolveEventId(event)} userIdPresent=true dataLength=${data.length}`,
    );
    await this.onboardingService.handleTextMessage(
      lineUserId,
      replyToken,
      data,
    );
  }
}
