import { UnauthorizedException } from '@nestjs/common';
import { MembershipAuthService } from './membership-auth.service';

describe('MembershipAuthService verifyLineIdToken', () => {
  const prisma = { membershipLinkToken: {} };
  const users = {
    findOrCreateByLineUserId: jest.fn().mockResolvedValue({
      user: { id: 'user-a' },
      created: false,
    }),
  };

  function serviceWithChannel(channelId: string) {
    const config = {
      get: (k: string) =>
        ({
          MEMBERSHIP_SESSION_SECRET: 'mem-secret',
          LINE_LOGIN_CHANNEL_ID: channelId,
        })[k],
    };
    return new MembershipAuthService(
      config as never,
      prisma as never,
      users as never,
    );
  }

  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('rejects when LINE_LOGIN_CHANNEL_ID missing', async () => {
    const service = serviceWithChannel('');
    await expect(service.verifyLineIdToken('tok')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts valid LIFF token and links via LINE sub only', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          iss: 'https://access.line.me',
          aud: 'channel-123',
          sub: 'Uline-user-a',
          name: 'Alice',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
    }) as never;

    const service = serviceWithChannel('channel-123');
    await expect(service.verifyLineIdToken('valid.id.token')).resolves.toBe(
      'user-a',
    );
    expect(users.findOrCreateByLineUserId).toHaveBeenCalledWith(
      'Uline-user-a',
      expect.objectContaining({ displayName: 'Alice' }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.line.me/oauth2/v2.1/verify',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects invalid token (LINE verify non-OK)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
    }) as never;
    const service = serviceWithChannel('channel-123');
    await expect(service.verifyLineIdToken('bad')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.findOrCreateByLineUserId).not.toHaveBeenCalled();
  });

  it('rejects expired token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          iss: 'https://access.line.me',
          aud: 'channel-123',
          sub: 'Uline-user-a',
          exp: Math.floor(Date.now() / 1000) - 10,
        }),
    }) as never;
    const service = serviceWithChannel('channel-123');
    await expect(service.verifyLineIdToken('expired')).rejects.toThrow(
      /หมดอายุ/,
    );
    expect(users.findOrCreateByLineUserId).not.toHaveBeenCalled();
  });

  it('rejects wrong audience', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          iss: 'https://access.line.me',
          aud: 'other-channel',
          sub: 'Uline-user-a',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
    }) as never;
    const service = serviceWithChannel('channel-123');
    await expect(service.verifyLineIdToken('tok')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.findOrCreateByLineUserId).not.toHaveBeenCalled();
  });

  it('rejects wrong issuer', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          iss: 'https://evil.example',
          aud: 'channel-123',
          sub: 'Uline-user-a',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
    }) as never;
    const service = serviceWithChannel('channel-123');
    await expect(service.verifyLineIdToken('tok')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.findOrCreateByLineUserId).not.toHaveBeenCalled();
  });

  it('rejects missing sub', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          iss: 'https://access.line.me',
          aud: 'channel-123',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
    }) as never;
    const service = serviceWithChannel('channel-123');
    await expect(service.verifyLineIdToken('tok')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
