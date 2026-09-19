import { Injectable, Logger } from '@nestjs/common';
import { FoodLog, NutritionProfile, User, WeightLog } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { dayBounds, getZonedDateParts } from '../food/day-bounds';
import { GoogleSheetsService, SheetCell } from './google-sheets.service';
import { sanitizeSheetRow } from './sheet-sanitize';
import { SHEET_TABS } from './sheets.constants';

/**
 * Reporting/export sync — DB is source of truth.
 * All methods swallow Google errors; callers must never await these for user UX.
 */
@Injectable()
export class SheetsSyncService {
  private readonly logger = new Logger(SheetsSyncService.name);

  constructor(
    private readonly googleSheets: GoogleSheetsService,
    private readonly prisma: PrismaService,
  ) {}

  isEnabled(): boolean {
    return this.googleSheets.isEnabled();
  }

  /** Fire-and-forget wrapper — never throws to callers. */
  enqueue(label: string, work: () => Promise<void>): void {
    void work().catch((error: unknown) => {
      this.logger.warn(
        `Sheets sync failed (${label}): ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    });
  }

  async upsertUser(user: User): Promise<void> {
    await this.googleSheets.upsertRowById(
      SHEET_TABS.USERS,
      user.id,
      sanitizeSheetRow([
        user.id,
        user.lineUserId ?? '',
        user.displayName ?? '',
        user.onboardingState,
        user.createdAt.toISOString(),
        user.updatedAt.toISOString(),
      ]),
    );
  }

  async upsertNutritionProfile(profile: NutritionProfile): Promise<void> {
    await this.googleSheets.upsertRowById(
      SHEET_TABS.NUTRITION_PROFILES,
      profile.id,
      sanitizeSheetRow([
        profile.id,
        profile.userId,
        profile.sex,
        profile.age,
        profile.heightCm,
        profile.currentWeightKg,
        profile.targetWeightKg,
        profile.activityLevel,
        profile.goal,
        profile.dailyCalories,
        profile.dailyProteinG,
        profile.dailyCarbsG,
        profile.dailyFatG,
        profile.updatedAt.toISOString(),
      ]),
    );
  }

  async appendFoodLog(log: FoodLog): Promise<void> {
    await this.googleSheets.upsertRowById(
      SHEET_TABS.FOOD_LOGS,
      log.id,
      sanitizeSheetRow([
        log.id,
        log.userId,
        log.eatenAt.toISOString(),
        log.mealType,
        log.foodName,
        log.calories,
        log.proteinG,
        log.carbsG,
        log.fatG,
        log.aiConfidence ?? '',
        log.notes ?? '',
        log.createdAt.toISOString(),
      ]),
    );
  }

  async appendWeightLog(log: WeightLog): Promise<void> {
    await this.googleSheets.upsertRowById(
      SHEET_TABS.WEIGHT_LOGS,
      log.id,
      sanitizeSheetRow([
        log.id,
        log.userId,
        log.weightKg,
        log.recordedAt.toISOString(),
        log.createdAt.toISOString(),
      ]),
    );
  }

  /**
   * DailySummary is a reporting view computed from DB (never from Sheet rows).
   * Stable row id: `${userId}:${YYYY-MM-DD}` in app timezone day.
   */
  async updateDailySummary(
    userId: string,
    day: Date = new Date(),
  ): Promise<void> {
    const { start, end } = dayBounds(day);
    const localDate = formatLocalDateKey(day);

    const [logs, profile] = await Promise.all([
      this.prisma.foodLog.findMany({
        where: { userId, eatenAt: { gte: start, lt: end } },
        select: {
          calories: true,
          proteinG: true,
          carbsG: true,
          fatG: true,
        },
      }),
      this.prisma.nutritionProfile.findUnique({ where: { userId } }),
    ]);

    const consumed = logs.reduce(
      (acc, log) => ({
        calories: acc.calories + log.calories,
        proteinG: acc.proteinG + log.proteinG,
        carbsG: acc.carbsG + log.carbsG,
        fatG: acc.fatG + log.fatG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );

    const rowId = `${userId}:${localDate}`;

    const row: SheetCell[] = sanitizeSheetRow([
      rowId,
      userId,
      localDate,
      consumed.calories,
      profile?.dailyCalories ?? '',
      consumed.proteinG,
      profile?.dailyProteinG ?? '',
      consumed.carbsG,
      profile?.dailyCarbsG ?? '',
      consumed.fatG,
      profile?.dailyFatG ?? '',
      new Date().toISOString(),
    ]);

    await this.googleSheets.upsertRowById(SHEET_TABS.DAILY_SUMMARY, rowId, row);
  }

  /** Backfill all existing DB rows into Sheets (internal use). */
  async backfillAll(): Promise<{
    users: number;
    profiles: number;
    foodLogs: number;
    weightLogs: number;
    dailySummaries: number;
  }> {
    if (!this.isEnabled()) {
      this.logger.warn('backfillAll skipped — Google Sheets not configured');
      return {
        users: 0,
        profiles: 0,
        foodLogs: 0,
        weightLogs: 0,
        dailySummaries: 0,
      };
    }

    const [users, profiles, foodLogs, weightLogs] = await Promise.all([
      this.prisma.user.findMany(),
      this.prisma.nutritionProfile.findMany(),
      this.prisma.foodLog.findMany(),
      this.prisma.weightLog.findMany(),
    ]);

    for (const user of users) {
      await this.upsertUser(user);
    }
    for (const profile of profiles) {
      await this.upsertNutritionProfile(profile);
    }
    for (const log of foodLogs) {
      await this.appendFoodLog(log);
    }
    for (const log of weightLogs) {
      await this.appendWeightLog(log);
    }

    // One DailySummary per user for "today" from DB.
    let dailySummaries = 0;
    for (const user of users) {
      await this.updateDailySummary(user.id, new Date());
      dailySummaries += 1;
    }

    // Also refresh summary for each distinct food-log day.
    const dayKeys = new Set<string>();
    for (const log of foodLogs) {
      const key = `${log.userId}:${formatLocalDateKey(log.eatenAt)}`;
      if (dayKeys.has(key)) {
        continue;
      }
      dayKeys.add(key);
      await this.updateDailySummary(log.userId, log.eatenAt);
      dailySummaries += 1;
    }

    return {
      users: users.length,
      profiles: profiles.length,
      foodLogs: foodLogs.length,
      weightLogs: weightLogs.length,
      dailySummaries,
    };
  }
}

function formatLocalDateKey(day: Date): string {
  const parts = getZonedDateParts(day);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}
