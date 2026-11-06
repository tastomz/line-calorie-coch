import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { LineWebhookService } from './line-webhook.service';
import { LineWebhookEvent } from './line.types';

const event = (id: string): LineWebhookEvent => ({
  type: 'message',
  webhookEventId: id,
  source: { type: 'user', userId: 'U1' },
  replyToken: 'reply-' + id,
  message: { type: 'text', text: 'บันทึก', id: 'msg-' + id },
});

function queued(id: string, status = 'PENDING') {
  return {
    id: 'row-' + id,
    lineEventId: id,
    eventType: 'message',
    payload: JSON.stringify(event(id)),
    userKey: 'U1',
    status,
    attemptCount: 0,
    createdAt: new Date(),
    leasedUntil: status === 'PROCESSING'
      ? new Date(Date.now() - 10_000)
      : null,
  };
}

describe('LINE durable webhook queue', () => {
  const lineEvent = {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  };
  const onboarding = {
    handleFollow: jest.fn(),
    handleTextMessage: jest.fn(),
    handleImageMessage: jest.fn(),
    isAdminChatActive: jest.fn(),
  };
  const service = new LineWebhookService(
    { lineEvent } as unknown as PrismaService,
    onboarding as unknown as OnboardingService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    lineEvent.create.mockResolvedValue({});
    lineEvent.findMany.mockResolvedValue([]);
    lineEvent.updateMany.mockResolvedValue({ count: 1 });
    lineEvent.count.mockResolvedValue(0);
    onboarding.isAdminChatActive.mockResolvedValue(false);
    onboarding.handleTextMessage.mockResolvedValue(undefined);
  });

  it('acknowledges a verified persisted event while AI is still running', async () => {
    let finish: (() => void) | undefined;
    onboarding.handleTextMessage.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    lineEvent.findMany.mockResolvedValueOnce([queued('slow')]);
    await expect(
      service.handleWebhookBody({ events: [event('slow')] }),
    ).resolves.toBeUndefined();
    expect(lineEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'PENDING' }) as unknown,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(onboarding.handleTextMessage).toHaveBeenCalledTimes(1);
    finish?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
  });

  it('deduplicates repeated deliveries using the database constraint', async () => {
    lineEvent.create
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
    await service.handleWebhookBody({ events: [event('same'), event('same')] });
    expect(lineEvent.create).toHaveBeenCalledTimes(2);
  });

  it('recovers an expired processing lease from a previous instance', async () => {
    lineEvent.findMany.mockResolvedValueOnce([queued('restart', 'PROCESSING')]);
    await service.drainOnce();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(onboarding.handleTextMessage).toHaveBeenCalledWith(
      'U1',
      'reply-restart',
      'บันทึก',
    );
    expect(lineEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED' }) as unknown,
      }) as unknown,
    );
  });

  it('prevents a newer same-user event from running while one is active', async () => {
    let finish: (() => void) | undefined;
    onboarding.handleTextMessage.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    lineEvent.findMany.mockResolvedValueOnce([
      queued('first'),
      queued('second'),
    ]);
    await service.drainOnce();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(onboarding.handleTextMessage).toHaveBeenCalledTimes(1);
    finish?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
});
