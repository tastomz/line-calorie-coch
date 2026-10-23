import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PAIR_CODE_PATTERN = /^ADMIN-[A-Z0-9]{6}$/;

/**
 * Who gets a LINE push when a user asks for a human admin.
 *
 * Instead of OA Manager notifying admins about every message, admins opt in:
 * /admin creates a one-time code (10 min), the admin sends it to the bot from
 * their own LINE, and that LINE account is flagged `adminNotify`. Codes live
 * in memory — fine for the single-replica service; a restart just voids them.
 */
@Injectable()
export class AdminNotifyService {
  private readonly logger = new Logger(AdminNotifyService.name);
  private readonly codes = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  createPairCode(now = Date.now()): { code: string; expiresAt: Date } {
    for (const [code, exp] of this.codes) {
      if (exp <= now) this.codes.delete(code);
    }
    const bytes = randomBytes(6);
    let suffix = '';
    for (let i = 0; i < 6; i += 1) {
      suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    const code = `ADMIN-${suffix}`;
    const expiresAt = now + CODE_TTL_MS;
    this.codes.set(code, expiresAt);
    return { code, expiresAt: new Date(expiresAt) };
  }

  /** One-time: a valid, unexpired code is consumed and the user opted in. */
  async redeemPairCode(
    userId: string,
    rawText: string,
    now = Date.now(),
  ): Promise<boolean> {
    const code = rawText.trim().toUpperCase();
    const exp = this.codes.get(code);
    if (!exp || exp <= now) return false;
    this.codes.delete(code);
    await this.prisma.user.update({
      where: { id: userId },
      data: { adminNotify: true },
    });
    this.logger.log(`Admin notify enabled userIdPrefix=${userId.slice(0, 8)}`);
    return true;
  }

  listRecipients() {
    return this.prisma.user.findMany({
      where: { adminNotify: true },
      select: { id: true, displayName: true, lineUserId: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async removeRecipient(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { adminNotify: false },
    });
  }
}
