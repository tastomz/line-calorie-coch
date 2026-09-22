import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';

const LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MEMBERSHIP_SESSION_COOKIE = 'membership_session';

type SessionPayload = {
  userId: string;
  exp: number;
};

/**
 * Account linking:
 * 1) Short-lived one-time signed link from LINE (preferred for bot → web)
 * 2) LINE Login ID token verification (LIFF / LINE Login)
 *
 * Never trust ?userId= or ?lineUserId= query params.
 */
@Injectable()
export class MembershipAuthService {
  private readonly logger = new Logger(MembershipAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  private sessionSecret(): string {
    const secret =
      (this.config.get<string>('MEMBERSHIP_SESSION_SECRET') ?? '').trim() ||
      (this.config.get<string>('ADMIN_SESSION_SECRET') ?? '').trim();
    if (!secret) {
      // Dev fallback — never use empty HMAC key.
      return 'dev-only-membership-session-secret-change-me';
    }
    return secret;
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** Create a one-time membership web login link for an authenticated LINE user. */
  async createMembershipLink(userId: string): Promise<{ url: string }> {
    const base = (this.config.get<string>('MEMBERSHIP_WEB_URL') ?? '')
      .trim()
      .replace(/\/$/, '');
    if (!base) {
      throw new Error('MEMBERSHIP_WEB_URL is not configured');
    }

    const raw = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + LINK_TTL_MS);

    await this.prisma.membershipLinkToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return { url: `${base}/login?t=${raw}` };
  }

  /** Consume one-time link token → internal userId. */
  async consumeLinkToken(rawToken: string): Promise<string> {
    const tokenHash = this.hashToken(rawToken.trim());
    const now = new Date();

    const row = await this.prisma.membershipLinkToken.findUnique({
      where: { tokenHash },
    });
    if (!row || row.usedAt || row.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedException('ลิงก์หมดอายุหรือไม่ถูกต้อง');
    }

    const updated = await this.prisma.membershipLinkToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    if (updated.count === 0) {
      throw new UnauthorizedException('ลิงก์ถูกใช้ไปแล้ว');
    }
    return row.userId;
  }

  signSession(userId: string, now = Date.now()): string {
    const payload: SessionPayload = {
      userId,
      exp: now + SESSION_TTL_MS,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', this.sessionSecret())
      .update(body)
      .digest('base64url');
    return `${body}.${sig}`;
  }

  verifySession(cookieValue: string | undefined): string {
    if (!cookieValue) {
      throw new UnauthorizedException('กรุณาเข้าสู่ระบบ');
    }
    const [body, sig] = cookieValue.split('.');
    if (!body || !sig) {
      throw new UnauthorizedException('เซสชันไม่ถูกต้อง');
    }
    const expected = createHmac('sha256', this.sessionSecret())
      .update(body)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('เซสชันไม่ถูกต้อง');
    }
    let payload: SessionPayload;
    try {
      payload = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as SessionPayload;
    } catch {
      throw new UnauthorizedException('เซสชันไม่ถูกต้อง');
    }
    if (!payload.userId || payload.exp < Date.now()) {
      throw new UnauthorizedException('เซสชันหมดอายุ');
    }
    return payload.userId;
  }

  /**
   * Verify LINE Login / LIFF ID token via LINE verify endpoint.
   * Requires LINE_LOGIN_CHANNEL_ID.
   */
  async verifyLineIdToken(idToken: string): Promise<string> {
    const channelId = (
      this.config.get<string>('LINE_LOGIN_CHANNEL_ID') ?? ''
    ).trim();
    if (!channelId) {
      throw new UnauthorizedException(
        'LINE Login ยังไม่ได้ตั้งค่า (LINE_LOGIN_CHANNEL_ID)',
      );
    }

    const body = new URLSearchParams({
      id_token: idToken,
      client_id: channelId,
    });

    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      this.logger.warn(`LINE ID token verify failed status=${res.status}`);
      throw new UnauthorizedException('ยืนยันตัวตน LINE ไม่สำเร็จ');
    }
    const data = (await res.json()) as {
      sub?: string;
      name?: string;
      picture?: string;
      exp?: number;
    };
    if (!data.sub) {
      throw new UnauthorizedException('ยืนยันตัวตน LINE ไม่สำเร็จ');
    }
    if (data.exp && data.exp * 1000 < Date.now()) {
      throw new UnauthorizedException('โทเคน LINE หมดอายุ');
    }

    const { user } = await this.users.findOrCreateByLineUserId(data.sub, {
      displayName: data.name,
      pictureUrl: data.picture,
    });
    return user.id;
  }
}
