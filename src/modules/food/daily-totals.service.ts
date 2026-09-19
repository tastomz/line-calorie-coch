import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { dayBounds } from './food-log.service';

export type DailyTotals = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type DailySummary = {
  totals: DailyTotals;
  targets: {
    dailyCalories: number;
    dailyProteinG: number;
    dailyCarbsG: number;
    dailyFatG: number;
  } | null;
};

@Injectable()
export class DailyTotalsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Totals are always derived from FoodLog rows for this userId + local day. */
  async getTotalsForUserOnDate(
    userId: string,
    day: Date = new Date(),
  ): Promise<DailyTotals> {
    const { start, end } = dayBounds(day);
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

    return logs.reduce<DailyTotals>(
      (acc, log) => ({
        calories: acc.calories + log.calories,
        proteinG: acc.proteinG + log.proteinG,
        carbsG: acc.carbsG + log.carbsG,
        fatG: acc.fatG + log.fatG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );
  }

  async getSummaryForUser(
    userId: string,
    day: Date = new Date(),
  ): Promise<DailySummary> {
    const [totals, profile] = await Promise.all([
      this.getTotalsForUserOnDate(userId, day),
      this.prisma.nutritionProfile.findUnique({ where: { userId } }),
    ]);

    return {
      totals,
      targets: profile
        ? {
            dailyCalories: profile.dailyCalories,
            dailyProteinG: profile.dailyProteinG,
            dailyCarbsG: profile.dailyCarbsG,
            dailyFatG: profile.dailyFatG,
          }
        : null,
    };
  }
}
