import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { validateSignature } from '@line/bot-sdk';
import { LineService } from './line.service';

describe('LineService', () => {
  const secret = 'test-channel-secret';

  function createService(channelSecret = secret): LineService {
    const config = {
      get: (key: string) => {
        if (key === 'LINE_CHANNEL_SECRET') return channelSecret;
        if (key === 'LINE_CHANNEL_ACCESS_TOKEN') return '';
        return undefined;
      },
    } as ConfigService;
    return new LineService(config);
  }

  function sign(body: Buffer, channelSecret = secret): string {
    return crypto
      .createHmac('sha256', channelSecret)
      .update(body)
      .digest('base64');
  }

  it('accepts a valid HMAC-SHA256 Base64 signature over the raw body', () => {
    const service = createService();
    const body = Buffer.from('{"destination":"x","events":[]}');
    const signature = sign(body);

    expect(service.verifySignature(body, signature)).toBe(true);
    expect(validateSignature(body, secret, signature)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const service = createService();
    const body = Buffer.from('{"events":[]}');
    expect(service.verifySignature(body, 'invalid')).toBe(false);
  });

  it('rejects missing signature', () => {
    const service = createService();
    expect(service.verifySignature(Buffer.from('{}'), undefined)).toBe(false);
  });

  it('rejects when body bytes differ from the signed payload', () => {
    const service = createService();
    const original = Buffer.from('{"events":[{"type":"follow"}]}');
    const signature = sign(original);
    const altered = Buffer.from(original.toString() + ' ');

    expect(service.verifySignature(altered, signature)).toBe(false);
    expect(service.verifySignature(original, signature)).toBe(true);
  });

  it('rejects when channel secret is empty', () => {
    const service = createService('');
    const body = Buffer.from('{"events":[]}');
    expect(service.verifySignature(body, sign(body))).toBe(false);
  });

  it('throws when replying without LINE_CHANNEL_ACCESS_TOKEN', async () => {
    const service = createService();
    expect(service.isMessagingClientReady()).toBe(false);
    await expect(service.replyText('reply-token', 'hello')).rejects.toThrow(
      /LINE_CHANNEL_ACCESS_TOKEN is not configured/,
    );
  });
});
