import { UnauthorizedException } from '@nestjs/common';
import { LineController } from './line.controller';
import { LineService } from './line.service';
import { LineWebhookService } from './line-webhook.service';

describe('LineController', () => {
  const lineService = {
    verifySignature: jest.fn(),
  };
  const webhookService = {
    handleWebhookBody: jest.fn(),
  };

  const controller = new LineController(
    lineService as unknown as LineService,
    webhookService as unknown as LineWebhookService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects when raw body is missing (no JSON re-serialize fallback)', async () => {
    await expect(controller.webhook(undefined, 'sig')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(lineService.verifySignature).not.toHaveBeenCalled();
    expect(webhookService.handleWebhookBody).not.toHaveBeenCalled();
  });

  it('rejects invalid signature', async () => {
    lineService.verifySignature.mockReturnValue(false);
    await expect(
      controller.webhook(Buffer.from('{"events":[]}'), 'bad'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(webhookService.handleWebhookBody).not.toHaveBeenCalled();
  });

  it('processes body when signature is valid against raw bytes', async () => {
    lineService.verifySignature.mockReturnValue(true);
    webhookService.handleWebhookBody.mockResolvedValue(undefined);

    const rawBody = Buffer.from('{"events":[]}');
    const result = await controller.webhook(rawBody, 'good');

    expect(lineService.verifySignature).toHaveBeenCalledWith(rawBody, 'good');
    expect(result).toEqual({ ok: true });
    expect(webhookService.handleWebhookBody).toHaveBeenCalledWith({
      events: [],
    });
  });
});
