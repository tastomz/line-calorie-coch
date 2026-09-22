import { Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export const ADMIN_SESSION_COOKIE = 'admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

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
    const expectedUser = (
      this.config.get<string>('ADMIN_USERNAME') ?? ''
    ).trim();
    if (!expectedUser || username !== expectedUser) {
      return false;
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
      JSON.stringify({ adminId, exp: Date.now() + SESSION_TTL_MS }),
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
    ) as { adminId?: string; exp?: number };
    if (!payload.adminId || !payload.exp || payload.exp < Date.now()) {
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
