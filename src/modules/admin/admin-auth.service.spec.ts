import { createHash } from 'crypto';
import {
  AdminAuthService,
  AdminPasswordError,
} from '../admin/admin-auth.service';

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

describe('AdminAuthService password change', () => {
  const secret = 'test-admin-secret';
  const rows: { username: string; passwordHash: string; changedAt: Date }[] =
    [];
  const prisma = {
    adminAuditLog: { create: jest.fn() },
    adminCredential: {
      findMany: jest.fn(() => Promise.resolve(rows)),
      upsert: jest.fn(
        (args: {
          create: { username: string; passwordHash: string; changedAt: Date };
        }) => {
          rows.splice(0, rows.length, args.create);
          return Promise.resolve(args.create);
        },
      ),
    },
  };
  const env: Record<string, string> = {
    ADMIN_USERNAME: 'admin',
    ADMIN_SESSION_SECRET: secret,
    ADMIN_PASSWORD_HASH: createHash('sha256')
      .update(`old-password-1:${secret}`)
      .digest('hex'),
    NODE_ENV: 'production',
  };
  const make = () =>
    new AdminAuthService(
      { get: (k: string) => env[k] } as never,
      prisma as never,
    );

  it('changes the password, rejects the old one and older sessions', async () => {
    const auth = make();
    const oldSession = auth.signSession('admin');
    await new Promise((r) => setTimeout(r, 5));
    await auth.changePassword('admin', 'old-password-1', 'new-password-123');
    expect(auth.verifyCredentials('admin', 'old-password-1')).toBe(false);
    expect(auth.verifyCredentials('admin', 'new-password-123')).toBe(true);
    expect(() => auth.verifySession(oldSession)).toThrow();
    expect(auth.verifySession(auth.signSession('admin'))).toBe('admin');
    expect(rows[0].passwordHash).toMatch(/^scrypt\$/);
    expect(rows[0].passwordHash).not.toContain('new-password');

    // Survives a restart: loaded from DB.
    const restarted = make();
    await restarted.onModuleInit();
    expect(restarted.verifyCredentials('admin', 'new-password-123')).toBe(true);
    expect(restarted.verifyCredentials('admin', 'old-password-1')).toBe(false);
  });

  it('rejects a wrong current password, short or unchanged passwords, LINE admins', async () => {
    const auth = make();
    await auth.onModuleInit();
    await expect(
      auth.changePassword('admin', 'wrong', 'another-password-1'),
    ).rejects.toThrow(AdminPasswordError);
    await expect(
      auth.changePassword('admin', 'new-password-123', 'short'),
    ).rejects.toThrow('12');
    await expect(
      auth.changePassword('admin', 'new-password-123', 'new-password-123'),
    ).rejects.toThrow(AdminPasswordError);
    await expect(
      auth.changePassword('user-cuid', 'x', 'another-password-1'),
    ).rejects.toThrow(AdminPasswordError);
  });
});
