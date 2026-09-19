import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { logEvent } from '../common/structured-log';

/** Default: keep webhook idempotency keys for 30 days. */
export const DEFAULT_LINE_EVENT_RETENTION_DAYS = 30;

export type RetentionCleanupResult = {
  expiredPendingDeleted: number;
  oldLineEventsDeleted: number;
};

/**
 * Safe retention cleanup for transient rows.
 * Does NOT delete FoodLog, WeightLog, User, or NutritionProfile.
 *
 * Run manually / via cron using `npm run cleanup:retention`.
 * No job queue in V1.
 */
@Injectable()
export class RetentionCleanupService {
  private readonly logger = new Logger(RetentionCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Remove PendingFoodAnalysis rows past expiresAt. Active pending stays. */
  async deleteExpiredPendingFood(now = new Date()): Promise<number> {
    const result = await this.prisma.pendingFoodAnalysis.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return result.count;
  }

  /**
   * Remove old LineEvent claim rows.
   * Only deletes events with processedAt older than the retention window.
   */
  async deleteOldLineEvents(
    retentionDays = DEFAULT_LINE_EVENT_RETENTION_DAYS,
    now = new Date(),
  ): Promise<number> {
    if (!Number.isFinite(retentionDays) || retentionDays < 1) {
      throw new Error('retentionDays must be a positive number');
    }
    const cutoff = new Date(
      now.getTime() - retentionDays * 24 * 60 * 60 * 1000,
    );
    const result = await this.prisma.lineEvent.deleteMany({
      where: { processedAt: { lt: cutoff } },
    });
    return result.count;
  }

  async run(options?: {
    lineEventRetentionDays?: number;
    now?: Date;
  }): Promise<RetentionCleanupResult> {
    const now = options?.now ?? new Date();
    const expiredPendingDeleted = await this.deleteExpiredPendingFood(now);
    const oldLineEventsDeleted = await this.deleteOldLineEvents(
      options?.lineEventRetentionDays ?? DEFAULT_LINE_EVENT_RETENTION_DAYS,
      now,
    );

    logEvent(this.logger, 'log', {
      event: 'retention_cleanup',
      expiredPendingDeleted,
      oldLineEventsDeleted,
    });

    return { expiredPendingDeleted, oldLineEventsDeleted };
  }
}
