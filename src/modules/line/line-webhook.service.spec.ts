import { LineOutboundError } from './line-outbound.error';
import { LineWebhookService } from './line-webhook.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

describe('LineWebhookService', () => {
  const prisma = {
    lineEvent: {
      create: jest.fn(),
      delete: jest.fn(),
    },
  };
  const onboarding = {
    handleFollow: jest.fn(),
    handleTextMessage: jest.fn(),
    handleImageMessage: jest.fn(),
  };

  const service = new LineWebhookService(
    prisma as unknown as PrismaService,
    onboarding as unknown as OnboardingService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.lineEvent.create.mockResolvedValue({ id: '1' });
    prisma.lineEvent.delete.mockResolvedValue({ id: '1' });
  });

  it('ignores unsupported event types safely', async () => {
    const result = await service.handleEvent({
      type: 'unfollow',
      webhookEventId: 'evt-unsupported',
      source: { userId: 'U1' },
    });

    expect(result).toBe('ignored');
    expect(onboarding.handleFollow).not.toHaveBeenCalled();
    expect(onboarding.handleTextMessage).not.toHaveBeenCalled();
  });

  it('skips duplicate events', async () => {
    prisma.lineEvent.create.mockResolvedValueOnce({ id: '1' });

    const first = await service.handleEvent({
      type: 'follow',
      webhookEventId: 'evt-dup',
      replyToken: 'r1',
      source: { userId: 'U1' },
    });
    expect(first).toBe('processed');
    expect(onboarding.handleFollow).toHaveBeenCalledTimes(1);

    prisma.lineEvent.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const second = await service.handleEvent({
      type: 'follow',
      webhookEventId: 'evt-dup',
      replyToken: 'r1',
      source: { userId: 'U1' },
    });

    expect(second).toBe('duplicate');
    expect(onboarding.handleFollow).toHaveBeenCalledTimes(1);
  });

  it('routes follow events to onboarding', async () => {
    await service.handleEvent({
      type: 'follow',
      webhookEventId: 'evt-follow',
      replyToken: 'token',
      source: { userId: 'U123' },
    });

    expect(onboarding.handleFollow).toHaveBeenCalledWith('U123', 'token');
  });

  it('routes text message events to onboarding', async () => {
    await service.handleEvent({
      type: 'message',
      webhookEventId: 'evt-msg',
      replyToken: 'token',
      source: { userId: 'U123' },
      message: { type: 'text', text: 'ชาย', id: 'm1' },
    });

    expect(onboarding.handleTextMessage).toHaveBeenCalledWith(
      'U123',
      'token',
      'ชาย',
    );
  });

  it('routes image message events to onboarding', async () => {
    await service.handleEvent({
      type: 'message',
      webhookEventId: 'evt-img',
      replyToken: 'token',
      source: { userId: 'U123' },
      message: { type: 'image', id: 'img-1' },
    });

    expect(onboarding.handleImageMessage).toHaveBeenCalledWith(
      'U123',
      'token',
      'img-1',
    );
  });

  it('releases event claim when mutation/onboarding fails (non-outbound)', async () => {
    onboarding.handleFollow.mockRejectedValueOnce(
      new Error('unexpected mutation failure'),
    );

    const result = await service.handleEvent({
      type: 'follow',
      webhookEventId: 'evt-fail',
      replyToken: 'token',
      source: { userId: 'U123' },
    });

    expect(result).toBe('ignored');
    expect(prisma.lineEvent.delete).toHaveBeenCalledWith({
      where: { lineEventId: 'evt-fail' },
    });
  });

  it('keeps claim when LINE reply fails after successful mutation', async () => {
    onboarding.handleTextMessage.mockRejectedValueOnce(
      new LineOutboundError('LINE replyMessage failed'),
    );

    const result = await service.handleEvent({
      type: 'message',
      webhookEventId: 'evt-reply-fail',
      replyToken: 'token',
      source: { userId: 'U123' },
      message: { type: 'text', text: 'บันทึก', id: 'm2' },
    });

    expect(result).toBe('processed');
    expect(prisma.lineEvent.delete).not.toHaveBeenCalled();
  });

  it('does not re-run mutation when the same webhook event is delivered again', async () => {
    onboarding.handleTextMessage.mockResolvedValueOnce(undefined);

    await service.handleEvent({
      type: 'message',
      webhookEventId: 'evt-idem',
      replyToken: 'token',
      source: { userId: 'U123' },
      message: { type: 'text', text: 'บันทึก', id: 'm3' },
    });

    prisma.lineEvent.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const second = await service.handleEvent({
      type: 'message',
      webhookEventId: 'evt-idem',
      replyToken: 'token',
      source: { userId: 'U123' },
      message: { type: 'text', text: 'บันทึก', id: 'm3' },
    });

    expect(second).toBe('duplicate');
    expect(onboarding.handleTextMessage).toHaveBeenCalledTimes(1);
  });

  it('claims events before processing in handleWebhookBody', async () => {
    onboarding.handleFollow.mockResolvedValue(undefined);

    await service.handleWebhookBody({
      destination: 'bot',
      events: [
        {
          type: 'follow',
          webhookEventId: 'evt-body-1',
          replyToken: 't1',
          source: { userId: 'U1' },
        },
      ],
    });

    expect(prisma.lineEvent.create).toHaveBeenCalledWith({
      data: { lineEventId: 'evt-body-1', eventType: 'follow' },
    });
    expect(onboarding.handleFollow).toHaveBeenCalled();
  });
});
