import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { LineOutboundError } from './line-outbound.error';
import { LineWebhookService } from './line-webhook.service';
import { LineWebhookEvent } from './line.types';

type QueueRow = {
  id: string;
  lineEventId: string;
  eventType: string;
  payload: string | null;
  userKey: string | null;
  status: string;
  attemptCount: number;
  nextAttemptAt: Date | null;
  leasedUntil: Date | null;
  workerId: string | null;
  createdAt: Date;
};

const message = (id: string, text: string, userId = 'U1'): LineWebhookEvent => ({
  type: 'message',
  webhookEventId: id,
  replyToken: 'reply-' + id,
  source: { type: 'user', userId },
  message: { type: 'text', text, id: 'msg-' + id },
});

async function eventually(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (check()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Queue did not reach the expected state');
}

describe('LINE durable event queue', () => {
  const rows = new Map<string, QueueRow>();
  let sequence = 0;
  const lineEvent = {
    create: jest.fn().mockImplementation(
      ({ data }: { data: { lineEventId: string; eventType: string; payload: string; userKey: string | null } }) => {
        if (rows.has(data.lineEventId)) {
          return Promise.reject(
            new Prisma.PrismaClientKnownRequestError('duplicate event', {
              code: 'P2002',
              clientVersion: 'test',
            }),
          );
        }
        const row: QueueRow = {
          id: 'row-' + ++sequence,
          lineEventId: data.lineEventId,
          eventType: data.eventType,
          payload: data.payload,
          userKey: data.userKey,
          status: 'PENDING',
          attemptCount: 0,
          nextAttemptAt: new Date(),
          leasedUntil: null,
          workerId: null,
          createdAt: new Date(Date.now() + sequence),
        };
        rows.set(data.lineEventId, row);
        return Promise.resolve(row);
      },
    ),
    findUnique: jest.fn().mockImplementation(
      ({ where }: { where: { lineEventId: string } }) =>
        Promise.resolve(rows.get(where.lineEventId) ?? null),
    ),
    findMany: jest.fn().mockImplementation(() => {
      const now = Date.now();
      return Promise.resolve(
        [...rows.values()]
          .filter((r) =>
            r.status === 'PENDING' ||
            (r.status === 'FAILED' && (r.nextAttemptAt?.getTime() ?? Infinity) <= now) ||
            (r.status === 'PROCESSING' && (r.leasedUntil?.getTime() ?? Infinity) < now),
          )
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .slice(0, 40),
      );
    }),
    count: jest.fn().mockImplementation(
      ({ where }: { where: { userKey: string; createdAt: { lt: Date } } }) =>
        Promise.resolve(
          [...rows.values()].filter(
            (r) =>
              r.userKey === where.userKey &&
              r.createdAt < where.createdAt.lt &&
              ['PENDING', 'PROCESSING', 'FAILED'].includes(r.status),
          ).length,
        ),
    ),
    updateMany: jest.fn().mockImplementation(
      ({ where, data }: {
        where: { id: string; status?: string; workerId?: string; leasedUntil?: { lt: Date }; nextAttemptAt?: { lte: Date } };
        data: { status?: string; attemptCount?: { increment: number }; leasedUntil?: Date | null; nextAttemptAt?: Date | null; workerId?: string | null };
      }) => {
        const row = [...rows.values()].find((r) => r.id === where.id);
        if (
          !row ||
          (where.status && row.status !== where.status) ||
          (where.workerId && row.workerId !== where.workerId) ||
          (where.leasedUntil && !(row.leasedUntil && row.leasedUntil < where.leasedUntil.lt)) ||
          (where.nextAttemptAt && !(row.nextAttemptAt && row.nextAttemptAt <= where.nextAttemptAt.lte))
        ) {
          return Promise.resolve({ count: 0 });
        }
        row.status = data.status ?? row.status;
        row.attemptCount += data.attemptCount?.increment ?? 0;
        if (data.workerId !== undefined) row.workerId = data.workerId;
        if (data.leasedUntil !== undefined) row.leasedUntil = data.leasedUntil;
        if (data.nextAttemptAt !== undefined) row.nextAttemptAt = data.nextAttemptAt;
        return Promise.resolve({ count: 1 });
      },
    ),
  };
  const onboarding = {
    handleFollow: jest.fn(),
    handleTextMessage: jest.fn(),
    handleImageMessage: jest.fn(),
    isAdminChatActive: jest.fn().mockResolvedValue(false),
  };
  const service = new LineWebhookService(
    { lineEvent } as unknown as PrismaService,
    onboarding as unknown as OnboardingService,
  );

  beforeEach(() => {
    rows.clear();
    sequence = 0;
    jest.clearAllMocks();
    onboarding.handleTextMessage.mockResolvedValue(undefined);
    onboarding.handleFollow.mockResolvedValue(undefined);
  });

  it('acknowledges accepted events without waiting for slow AI processing', async () => {
    let release: (() => void) | undefined;
    onboarding.handleTextMessage.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await service.handleWebhookBody({ events: [message('slow', 'ข้าวมันไก่')] });
    await eventually(() => onboarding.handleTextMessage.mock.calls.length === 1);
    expect(rows.get('slow')?.status).toBe('PROCESSING');
    release?.();
    await eventually(() => rows.get('slow')?.status === 'COMPLETED');
  });

  it('deduplicates concurrent webhook deliveries by database unique key', async () => {
    const body = { events: [message('dup', 'บันทึก')] };
    await Promise.all([
      service.handleWebhookBody(body),
      service.handleWebhookBody(body),
    ]);
    await eventually(() => rows.get('dup')?.status === 'COMPLETED');
    expect(rows.size).toBe(1);
    expect(onboarding.handleTextMessage).toHaveBeenCalledTimes(1);
  });

  it('keeps failed events and retries them without deleting the claim', async () => {
    onboarding.handleTextMessage
      .mockRejectedValueOnce(new Error('temporary DB error'))
      .mockResolvedValueOnce(undefined);
    await service.handleWebhookBody({ events: [message('retry', 'บันทึก')] });
    await eventually(() => rows.get('retry')?.status === 'FAILED');
    const failed = rows.get('retry');
    if (!failed) throw new Error('missing queued event');
    failed.nextAttemptAt = new Date(Date.now() - 1);
    await service.drainOnce();
    await eventually(() => rows.get('retry')?.status === 'COMPLETED');
    expect(onboarding.handleTextMessage).toHaveBeenCalledTimes(2);
    expect(failed.attemptCount).toBe(2);
  });

  it('serializes user events while allowing later events to wait', async () => {
    let release: (() => void) | undefined;
    onboarding.handleTextMessage.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await service.handleWebhookBody({
      events: [message('one', 'อาหาร'), message('two', 'บันทึก')],
    });
    await eventually(() => onboarding.handleTextMessage.mock.calls.length === 1);
    await service.drainOnce();
    expect(onboarding.handleTextMessage).toHaveBeenCalledTimes(1);
    release?.();
    await eventually(() => rows.get('two')?.status === 'COMPLETED');
    expect(onboarding.handleTextMessage).toHaveBeenCalledTimes(2);
  });

  it('reclaims expired processing leases after a worker restart', async () => {
    const event = message('crashed', 'ข้าว');
    const row: QueueRow = {
      id: 'row-crashed',
      lineEventId: 'crashed',
      eventType: 'message',
      payload: JSON.stringify(event),
      userKey: 'U1',
      status: 'PROCESSING',
      attemptCount: 1,
      nextAttemptAt: null,
      leasedUntil: new Date(Date.now() - 60_000),
      workerId: 'old-instance',
      createdAt: new Date(),
    };
    rows.set('crashed', row);
    await service.drainOnce();
    await eventually(() => row.status === 'COMPLETED');
    expect(row.attemptCount).toBe(2);
  });

  it('does not retry a reply failure after a business mutation', async () => {
    onboarding.handleTextMessage.mockRejectedValueOnce(
      new LineOutboundError('reply token expired'),
    );
    await service.handleWebhookBody({ events: [message('outbound', 'บันทึก')] });
    await eventually(() => rows.get('outbound')?.status === 'COMPLETED');
    await service.drainOnce();
    expect(onboarding.handleTextMessage).toHaveBeenCalledTimes(1);
  });
});
