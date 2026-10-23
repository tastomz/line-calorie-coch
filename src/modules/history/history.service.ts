import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OnboardingState } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  addLocalDays,
  getZonedDateParts,
  localDateKey,
  localDateRangeBounds,
} from '../weight/weight-date';
import { WeightLogService } from '../weight/weight-log.service';
import { weightProgress, WeightProgress } from './weight-progress';

export type HistoryDay = {
  date: string;
  calories: number;
  proteinG: number;
  foods: { name: string; calories: number; mealType: string; eatenAt: Date }[];
  waterMl: number;
  sleepMinutes: number | null;
  exerciseMinutes: number;
  exerciseKcal: number;
  weightKg: number | null;
};

export type HistoryPayload = {
  hasProfile: boolean;
  targets: { dailyCalories: number; dailyProteinG: number } | null;
  progress: WeightProgress | null;
  days: HistoryDay[];
};

export const MIN_WEIGHT_KG = 20;
export const MAX_WEIGHT_KG = 300;
export const RESET_CONFIRM_TEXT = 'ลบข้อมูล';

const round1 = (n: number) => Math.round(n * 10) / 10;

@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly weights: WeightLogService,
  ) {}

  /** Last `days` local days (today first) of everything the user logged. */
  async getHistory(
    userId: string,
    days = 7,
    now = new Date(),
  ): Promise<HistoryPayload> {
    const today = getZonedDateParts(now);
    const from = addLocalDays(today, -(days - 1));
    const { start, end } = localDateRangeBounds(from, today);
    const keys = Array.from({ length: days }, (_, i) =>
      localDateKey(addLocalDays(today, -i)),
    );
    const keyOf = (d: Date) => localDateKey(getZonedDateParts(d));

    const [
      profile,
      foods,
      water,
      sleeps,
      exercises,
      weightsInRange,
      latest,
      earliest,
    ] = await Promise.all([
      this.prisma.nutritionProfile.findUnique({ where: { userId } }),
      this.prisma.foodLog.findMany({
        where: { userId, eatenAt: { gte: start, lt: end } },
        orderBy: { eatenAt: 'asc' },
      }),
      this.prisma.hydrationLog.findMany({
        where: { userId, recordedAt: { gte: start, lt: end } },
      }),
      this.prisma.sleepLog.findMany({
        where: { userId, sleepDate: { in: keys } },
      }),
      this.prisma.exerciseLog.findMany({
        where: { userId, performedAt: { gte: start, lt: end } },
      }),
      this.prisma.weightLog.findMany({
        where: { userId, recordedAt: { gte: start, lt: end } },
        orderBy: { recordedAt: 'asc' },
      }),
      this.weights.getLatestForUser(userId),
      this.weights.getEarliestForUser(userId),
    ]);

    const byDay = new Map<string, HistoryDay>(
      keys.map((date) => [
        date,
        {
          date,
          calories: 0,
          proteinG: 0,
          foods: [],
          waterMl: 0,
          sleepMinutes: null,
          exerciseMinutes: 0,
          exerciseKcal: 0,
          weightKg: null,
        },
      ]),
    );
    for (const f of foods) {
      const d = byDay.get(keyOf(f.eatenAt));
      if (!d) continue;
      d.calories += f.calories;
      d.proteinG += f.proteinG;
      d.foods.push({
        name: f.foodName,
        calories: Math.round(f.calories),
        mealType: f.mealType,
        eatenAt: f.eatenAt,
      });
    }
    for (const w of water) {
      const d = byDay.get(keyOf(w.recordedAt));
      if (d) d.waterMl += w.amountMl;
    }
    for (const s of sleeps) {
      const d = byDay.get(s.sleepDate);
      if (d) d.sleepMinutes = (d.sleepMinutes ?? 0) + s.durationMinutes;
    }
    for (const e of exercises) {
      const d = byDay.get(keyOf(e.performedAt));
      if (!d) continue;
      d.exerciseMinutes += e.durationMinutes;
      d.exerciseKcal += e.caloriesBurned ?? 0;
    }
    for (const w of weightsInRange) {
      const d = byDay.get(keyOf(w.recordedAt));
      if (d) d.weightKg = w.weightKg; // latest of the day wins (asc order)
    }
    for (const d of byDay.values()) {
      d.calories = Math.round(d.calories);
      d.proteinG = round1(d.proteinG);
      d.exerciseKcal = Math.round(d.exerciseKcal);
    }

    let progress: WeightProgress | null = null;
    if (profile) {
      const startKg =
        profile.startWeightKg ?? earliest?.weightKg ?? profile.currentWeightKg;
      const currentKg = latest?.weightKg ?? profile.currentWeightKg;
      progress = weightProgress(startKg, currentKg, profile.targetWeightKg);
    }

    return {
      hasProfile: Boolean(profile),
      targets: profile
        ? {
            dailyCalories: profile.dailyCalories,
            dailyProteinG: profile.dailyProteinG,
          }
        : null,
      progress,
      days: keys.map((k) => byDay.get(k)!),
    };
  }

  async logWeight(userId: string, weightKg: unknown) {
    if (
      typeof weightKg !== 'number' ||
      !Number.isFinite(weightKg) ||
      weightKg < MIN_WEIGHT_KG ||
      weightKg > MAX_WEIGHT_KG
    ) {
      throw new BadRequestException(
        `น้ำหนักต้องอยู่ระหว่าง ${MIN_WEIGHT_KG}–${MAX_WEIGHT_KG} kg`,
      );
    }
    return this.weights.createForUser(userId, round1(weightKg));
  }

  /**
   * "ตั้งเป้าหมายใหม่": wipe every health record and the nutrition profile, and
   * send the user back to onboarding. Membership (subscriptions, payments,
   * promo redemptions) and AI usage/billing logs are kept.
   */
  async resetGoal(userId: string, confirm: unknown): Promise<void> {
    if (confirm !== RESET_CONFIRM_TEXT) {
      throw new BadRequestException(
        `พิมพ์ "${RESET_CONFIRM_TEXT}" เพื่อยืนยัน`,
      );
    }
    const where = { userId };
    await this.prisma.$transaction([
      this.prisma.foodLog.deleteMany({ where }),
      this.prisma.pendingFoodAnalysis.deleteMany({ where }),
      this.prisma.weightLog.deleteMany({ where }),
      this.prisma.sleepLog.deleteMany({ where }),
      this.prisma.exerciseLog.deleteMany({ where }),
      this.prisma.activityDailyLog.deleteMany({ where }),
      this.prisma.hydrationLog.deleteMany({ where }),
      this.prisma.recoveryLog.deleteMany({ where }),
      this.prisma.bodyScan.deleteMany({ where }),
      this.prisma.pendingBodyScan.deleteMany({ where }),
      this.prisma.mealPlan.deleteMany({ where }),
      this.prisma.weeklyHealthReview.deleteMany({ where }),
      this.prisma.nutritionProfile.deleteMany({ where }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          onboardingState: OnboardingState.NOT_STARTED,
          draftSex: null,
          draftAge: null,
          draftHeightCm: null,
          draftCurrentWeightKg: null,
          draftTargetWeightKg: null,
          draftActivityLevel: null,
          draftGoal: null,
        },
      }),
    ]);
    this.logger.log(
      `Goal reset (health data wiped) userIdPrefix=${userId.slice(0, 8)}`,
    );
  }
}
