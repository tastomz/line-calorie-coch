import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export const ADMIN_SESSION_COOKIE = 'admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const MIN_ADMIN_PASSWORD_LENGTH = 12;
const MAX_ADMIN_PASSWORD_LENGTH = 200;

export class AdminPasswordError extends Error {}

/** "scrypt$<salt>$<hash>" (base64). */
export function hashAdminPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyAdminPasswordHash(
  password: string,
  stored: string,
): boolean {
  const [alg, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), 32);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

type StoredCredential = { passwordHash: string; changedAtMs: number };

@Injectable()
export class AdminAuthService implements OnModuleInit {
  private readonly logger = new Logger(AdminAuthService.name);
  /** Passwords changed from /admin (DB), cached — the guard is synchronous. */
  private readonly stored = new Map<string, StoredCredential>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    try {
      const rows = await this.prisma.adminCredential.findMany();
      for (const r of rows) {
        this.stored.set(r.username, {
          passwordHash: r.passwordHash,
          changedAtMs: r.changedAt.getTime(),
        });
      }
    } catch (error) {
      this.logger.warn(
        `Admin credentials not loaded: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  private expectedUsername(): string {
    return (this.config.get<string>('ADMIN_USERNAME') ?? '').trim();
  }

  /** True for the env admin (who has a password), not LINE-role admins. */
  isPasswordAdmin(adminId: string): boolean {
    return Boolean(adminId) && adminId === this.expectedUsername();
  }

  /**
   * Change the env admin's password. Stored in DB (scrypt) and takes priority
   * over ADMIN_PASSWORD_HASH; every older session is signed out.
   */
  async changePassword(
    username: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (!this.isPasswordAdmin(username)) {
      throw new AdminPasswordError('บัญชีนี้ไม่มีรหัสผ่านให้เปลี่ยน');
    }
    if (!this.verifyCredentials(username, currentPassword)) {
      throw new AdminPasswordError('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    }
    if (
      typeof newPassword !== 'string' ||
      newPassword.length < MIN_ADMIN_PASSWORD_LENGTH ||
      newPassword.length > MAX_ADMIN_PASSWORD_LENGTH
    ) {
      throw new AdminPasswordError(
        `รหัสผ่านใหม่ต้องยาว ${MIN_ADMIN_PASSWORD_LENGTH}–${MAX_ADMIN_PASSWORD_LENGTH} ตัวอักษร`,
      );
    }
    if (newPassword === currentPassword) {
      throw new AdminPasswordError('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม');
    }
    const passwordHash = hashAdminPassword(newPassword);
    const changedAt = new Date();
    await this.prisma.adminCredential.upsert({
      where: { username },
      create: { username, passwordHash, changedAt },
      update: { passwordHash, changedAt },
    });
    this.stored.set(username, {
      passwordHash,
      changedAtMs: changedAt.getTime(),
    });
  }

  private secret(): string {
    const s = (this.config.get<string>('ADMIN_SESSION_SECRET') ?? '').trim();
    if (!s) {
      return 'dev-only-admin-session-secret-change-me';
    }
    return s;
  }

  /**
   * Env-based admin credentials.
   * Prefer ADMIN_PASSWORD_HASH (sha256 hex of password + secret).
   * Dev-only: ADMIN_PASSWORD plaintext in env (never in production DB).
   */
  verifyCredentials(username: string, password: string): boolean {
    const expectedUser = this.expectedUsername();
    if (!expectedUser || username !== expectedUser) {
      return false;
    }

    const changed = this.stored.get(username);
    if (changed) {
      return verifyAdminPasswordHash(password, changed.passwordHash);
    }

    const hash = (this.config.get<string>('ADMIN_PASSWORD_HASH') ?? '').trim();
    if (hash) {
      const computed = createHash('sha256')
        .update(`${password}:${this.secret()}`)
        .digest('hex');
      const a = Buffer.from(computed);
      const b = Buffer.from(hash);
      return a.length === b.length && timingSafeEqual(a, b);
    }

    const nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development';
    const plain = (this.config.get<string>('ADMIN_PASSWORD') ?? '').trim();
    if (nodeEnv === 'production') {
      this.logger.warn(
        'Admin login blocked: ADMIN_PASSWORD_HASH required in production',
      );
      return false;
    }
    if (!plain) return false;
    const pa = Buffer.from(password);
    const pb = Buffer.from(plain);
    return pa.length === pb.length && timingSafeEqual(pa, pb);
  }

  signSession(adminId: string): string {
    const body = Buffer.from(
      JSON.stringify({
        adminId,
        iat: Date.now(),
        exp: Date.now() + SESSION_TTL_MS,
      }),
    ).toString('base64url');
    const sig = createHmac('sha256', this.secret())
      .update(body)
      .digest('base64url');
    return `${body}.${sig}`;
  }

  verifySession(cookie: string | undefined): string {
    if (!cookie) throw new Error('unauthorized');
    const [body, sig] = cookie.split('.');
    if (!body || !sig) throw new Error('unauthorized');
    const expected = createHmac('sha256', this.secret())
      .update(body)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error('unauthorized');
    }
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as { adminId?: string; iat?: number; exp?: number };
    if (!payload.adminId || !payload.exp || payload.exp < Date.now()) {
      throw new Error('unauthorized');
    }
    // Password changed after this session was issued → signed out.
    const changed = this.stored.get(payload.adminId);
    if (changed && (payload.iat ?? 0) < changed.changedAtMs) {
      throw new Error('unauthorized');
    }
    return payload.adminId;
  }

  async audit(
    adminId: string,
    action: string,
    targetType?: string,
    targetId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
    this.logger.log(
      JSON.stringify({
        event: 'admin_action',
        adminId,
        action,
        targetType,
        targetId,
      }),
    );
  }
}
