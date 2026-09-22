import { createHash } from 'crypto';
import { AdminAuthService } from '../admin/admin-auth.service';

describe('AdminAuthService', () => {
  const prisma = { adminAuditLog: { create: jest.fn() } };
  const secret = 'test-admin-secret';

  function service(env: Record<string, string>) {
    const config = {
      get: (k: string) => env[k],
    };
    return new AdminAuthService(config as never, prisma as never);
  }

  it('rejects unauthorized credentials', () => {
    const auth = service({
      ADMIN_USERNAME: 'admin',
      ADMIN_SESSION_SECRET: secret,
      ADMIN_PASSWORD_HASH: createHash('sha256')
        .update(`correct:${secret}`)
        .digest('hex'),
      NODE_ENV: 'development',
    });
    expect(auth.verifyCredentials('admin', 'wrong')).toBe(false);
    expect(auth.verifyCredentials('nope', 'correct')).toBe(false);
  });

  it('accepts matching password hash', () => {
    const auth = service({
      ADMIN_USERNAME: 'admin',
      ADMIN_SESSION_SECRET: secret,
      ADMIN_PASSWORD_HASH: createHash('sha256')
        .update(`correct:${secret}`)
        .digest('hex'),
      NODE_ENV: 'production',
    });
    expect(auth.verifyCredentials('admin', 'correct')).toBe(true);
  });

  it('signs and verifies admin session', () => {
    const auth = service({
      ADMIN_USERNAME: 'admin',
      ADMIN_SESSION_SECRET: secret,
      ADMIN_PASSWORD_HASH: 'x',
      NODE_ENV: 'development',
    });
    const token = auth.signSession('admin');
    expect(auth.verifySession(token)).toBe('admin');
    expect(() => auth.verifySession('tampered')).toThrow();
  });
});
