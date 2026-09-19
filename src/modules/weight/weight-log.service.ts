import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import {
  addLocalDays,
  dayBounds,
  getZonedDateParts,
  localDateKey,
  localDateRangeBounds,
  LocalDateParts,
} from './weight-date';

export type DailyWeightAverage = {
  dateKey: string;
  parts: LocalDateParts;
  averageKg: number;
  count: number;
};

export type WeightTrend = {
  recentAverageKg: number;
  previousAverageKg: number;
  changeKg: number;
  recentDaysWithData: number;
  previousDaysWithData: number;
};

export type WeightTargetProgress = {
  latestKg: number;
  targetKg: number;
  remainingKg: number;
};

@Injectable()
export class WeightLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  /** Always scoped by userId — never trust client-supplied ids from text. */
  async createForUser(
    userId: string,
    weightKg: number,
    recordedAt: Date = new Date(),
  ) {
    await this.usersService.findByIdOrThrow(userId);

    // WeightLog is historical; also sync NutritionProfile.currentWeightKg.
    // Do NOT recalculate calorie targets here (product: targets stay until profile edit).
    return this.prisma.$transaction(async (tx) => {
      const log = await tx.weightLog.create({
        data: {
          userId,
          weightKg,
          recordedAt,
        },
      });

      await tx.nutritionProfile.updateMany({
        where: { userId },
        data: { currentWeightKg: weightKg },
      });

      return log;
    });
  }

  async listForUserOnDate(userId: string, day: Date = new Date()) {
    const { start, end } = dayBounds(day);
    return this.prisma.weightLog.findMany({
      where: {
        userId,
        recordedAt: { gte: start, lt: end },
      },
      orderBy: { recordedAt: 'asc' },
    });
  }

  async getLatestForUser(userId: string) {
    return this.prisma.weightLog.findFirst({
      where: { userId },
      orderBy: { recordedAt: 'desc' },
    });
  }

  async getTodayAverageKg(
    userId: string,
    day: Date = new Date(),
  ): Promise<number | null> {
    const logs = await this.listForUserOnDate(userId, day);
    if (logs.length === 0) {
      return null;
    }
    return average(logs.map((log) => log.weightKg));
  }

  /**
   * Daily averages for the last `dayCount` local calendar days (including today),
   * newest first. Days without logs are omitted.
   */
  async getRecentDailyAverages(
    userId: string,
    dayCount: number = 7,
    asOf: Date = new Date(),
  ): Promise<DailyWeightAverage[]> {
    const today = getZonedDateParts(asOf);
    const from = addLocalDays(today, -(dayCount - 1));
    const { start, end } = localDateRangeBounds(from, today);

    const logs = await this.prisma.weightLog.findMany({
      where: {
        userId,
        recordedAt: { gte: start, lt: end },
      },
      orderBy: { recordedAt: 'asc' },
    });

    const byDay = new Map<
      string,
      { parts: LocalDateParts; values: number[] }
    >();
    for (const log of logs) {
      const parts = getZonedDateParts(log.recordedAt);
      const key = localDateKey(parts);
      const bucket = byDay.get(key) ?? { parts, values: [] };
      bucket.values.push(log.weightKg);
      byDay.set(key, bucket);
    }

    const result: DailyWeightAverage[] = [];
    for (let i = 0; i < dayCount; i += 1) {
      const parts = addLocalDays(today, -i);
      const key = localDateKey(parts);
      const bucket = byDay.get(key);
      if (!bucket) {
        continue;
      }
      result.push({
        dateKey: key,
        parts,
        averageKg: average(bucket.values),
        count: bucket.values.length,
      });
    }
    return result;
  }

  /**
   * Compare average of daily averages in recent 7 local days
   * vs previous 7 local days. Pure DB math — no AI.
   */
  async getSevenDayTrend(
    userId: string,
    asOf: Date = new Date(),
  ): Promise<WeightTrend | null> {
    const today = getZonedDateParts(asOf);
    const recentFrom = addLocalDays(today, -6);
    const previousTo = addLocalDays(today, -7);
    const previousFrom = addLocalDays(today, -13);

    const [recentDays, previousDays] = await Promise.all([
      this.dailyAveragesInRange(userId, recentFrom, today),
      this.dailyAveragesInRange(userId, previousFrom, previousTo),
    ]);

    if (recentDays.length === 0 || previousDays.length === 0) {
      return null;
    }

    const recentAverageKg = average(recentDays.map((d) => d.averageKg));
    const previousAverageKg = average(previousDays.map((d) => d.averageKg));

    return {
      recentAverageKg,
      previousAverageKg,
      changeKg: round1(recentAverageKg - previousAverageKg),
      recentDaysWithData: recentDays.length,
      previousDaysWithData: previousDays.length,
    };
  }

  async getTargetProgress(
    userId: string,
  ): Promise<WeightTargetProgress | null> {
    const [latest, profile] = await Promise.all([
      this.getLatestForUser(userId),
      this.prisma.nutritionProfile.findUnique({ where: { userId } }),
    ]);

    if (!latest || !profile) {
      return null;
    }

    return {
      latestKg: latest.weightKg,
      targetKg: profile.targetWeightKg,
      remainingKg: round1(latest.weightKg - profile.targetWeightKg),
    };
  }

  /** Earliest WeightLog for progress-from-start style questions. */
  async getEarliestForUser(userId: string) {
    return this.prisma.weightLog.findFirst({
      where: { userId },
      orderBy: { recordedAt: 'asc' },
    });
  }

  /**
   * Change since first logged weight (latest - earliest).
   * Negative means weight went down.
   */
  async getChangeSinceFirst(userId: string): Promise<{
    earliestKg: number;
    latestKg: number;
    changeKg: number;
  } | null> {
    const [earliest, latest] = await Promise.all([
      this.getEarliestForUser(userId),
      this.getLatestForUser(userId),
    ]);
    if (!earliest || !latest) {
      return null;
    }
    return {
      earliestKg: earliest.weightKg,
      latestKg: latest.weightKg,
      changeKg: round1(latest.weightKg - earliest.weightKg),
    };
  }

  async findByIdForUser(userId: string, weightLogId: string) {
    const log = await this.prisma.weightLog.findFirst({
      where: { id: weightLogId, userId },
    });
    if (!log) {
      throw new NotFoundException('WeightLog not found');
    }
    return log;
  }

  private async dailyAveragesInRange(
    userId: string,
    from: LocalDateParts,
    to: LocalDateParts,
  ): Promise<DailyWeightAverage[]> {
    const { start, end } = localDateRangeBounds(from, to);
    const logs = await this.prisma.weightLog.findMany({
      where: {
        userId,
        recordedAt: { gte: start, lt: end },
      },
    });

    const byDay = new Map<
      string,
      { parts: LocalDateParts; values: number[] }
    >();
    for (const log of logs) {
      const parts = getZonedDateParts(log.recordedAt);
      const key = localDateKey(parts);
      const bucket = byDay.get(key) ?? { parts, values: [] };
      bucket.values.push(log.weightKg);
      byDay.set(key, bucket);
    }

    return [...byDay.values()].map((bucket) => ({
      dateKey: localDateKey(bucket.parts),
      parts: bucket.parts,
      averageKg: average(bucket.values),
      count: bucket.values.length,
    }));
  }
}

export function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return round2(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatWeightKg(value: number): string {
  const rounded = round1(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
