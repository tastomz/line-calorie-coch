import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { dayBounds } from './day-bounds';

export type MacroTotals = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/** Phase 4 domain object — always derived from FoodLog + NutritionProfile. */
export type DailyCoachSummary = {
  date: Date;
  consumed: MacroTotals;
  target: MacroTotals;
  remaining: MacroTotals;
};

export class NutritionProfileMissingError extends Error {
  constructor() {
    super('NutritionProfile is missing');
    this.name = 'NutritionProfileMissingError';
  }
}

@Injectable()
export class DailySummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Aggregate today's FoodLogs for this userId and compare to current profile targets.
   * Totals are NEVER invented — only summed from DB rows.
   */
  async getDailySummary(
    userId: string,
    date: Date = new Date(),
  ): Promise<DailyCoachSummary> {
    await this.usersService.findByIdOrThrow(userId);

    const profile = await this.prisma.nutritionProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NutritionProfileMissingError();
    }

    const { start, end } = dayBounds(date);
    const logs = await this.prisma.foodLog.findMany({
      where: {
        userId,
        eatenAt: { gte: start, lt: end },
      },
      select: {
        calories: true,
        proteinG: true,
        carbsG: true,
        fatG: true,
      },
    });

    const consumed = logs.reduce<MacroTotals>(
      (acc, log) => ({
        calories: acc.calories + log.calories,
        proteinG: acc.proteinG + log.proteinG,
        carbsG: acc.carbsG + log.carbsG,
        fatG: acc.fatG + log.fatG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );

    const target: MacroTotals = {
      calories: profile.dailyCalories,
      proteinG: profile.dailyProteinG,
      carbsG: profile.dailyCarbsG,
      fatG: profile.dailyFatG,
    };

    const remaining: MacroTotals = {
      calories: target.calories - consumed.calories,
      proteinG: target.proteinG - consumed.proteinG,
      carbsG: target.carbsG - consumed.carbsG,
      fatG: target.fatG - consumed.fatG,
    };

    return {
      date,
      consumed: {
        calories: clampNonNegative(consumed.calories),
        proteinG: clampNonNegative(consumed.proteinG),
        carbsG: clampNonNegative(consumed.carbsG),
        fatG: clampNonNegative(consumed.fatG),
      },
      target: {
        calories: clampNonNegative(target.calories),
        proteinG: clampNonNegative(target.proteinG),
        carbsG: clampNonNegative(target.carbsG),
        fatG: clampNonNegative(target.fatG),
      },
      remaining,
    };
  }

  /** Soft variant used by callers that already gated onboarding. */
  async getDailySummaryOrNull(
    userId: string,
    date: Date = new Date(),
  ): Promise<DailyCoachSummary | null> {
    try {
      return await this.getDailySummary(userId, date);
    } catch (error) {
      if (
        error instanceof NutritionProfileMissingError ||
        error instanceof NotFoundException
      ) {
        return null;
      }
      throw error;
    }
  }
}

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value < 0 ? 0 : value;
}
