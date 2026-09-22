import { createHash, randomBytes } from 'crypto';
import { MembershipAuthService } from './membership-auth.service';

describe('MembershipAuthService session', () => {
  const prisma = {
    membershipLinkToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const users = { findOrCreateByLineUserId: jest.fn() };
  const config = {
    get: (k: string) =>
      ({
        MEMBERSHIP_SESSION_SECRET: 'mem-secret',
        MEMBERSHIP_WEB_URL: 'http://localhost:3000',
        LINE_LOGIN_CHANNEL_ID: '',
      })[k],
  };

  const service = new MembershipAuthService(
    config as never,
    prisma as never,
    users as never,
  );

  it('signs and verifies membership session bound to userId', () => {
    const token = service.signSession('user-a');
    expect(service.verifySession(token)).toBe('user-a');
    expect(() => service.verifySession('bad')).toThrow();
  });

  it('creates membership link without exposing raw userId in trust path', async () => {
    prisma.membershipLinkToken.create.mockResolvedValue({});
    const { url } = await service.createMembershipLink('user-a');
    expect(url).toContain('/login?t=');
    expect(url).not.toContain('userId=');
    expect(url).not.toContain('user-a');
  });

  it('consumes one-time link token atomically', async () => {
    const raw = randomBytes(8).toString('base64url');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    prisma.membershipLinkToken.findUnique.mockResolvedValue({
      id: 'tok1',
      userId: 'user-a',
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });
    prisma.membershipLinkToken.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.consumeLinkToken(raw)).resolves.toBe('user-a');
  });
});
