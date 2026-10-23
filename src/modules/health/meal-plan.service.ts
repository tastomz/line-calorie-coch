import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { dayBounds } from '../food/day-bounds';
import { todayDateKey } from './program-week';

/** Deterministic meal allocation — 0 AI. */
export const MEAL_ALLOCATION: Record<
  'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK',
  number
> = {
  BREAKFAST: 0.25,
  LUNCH: 0.3,
  DINNER: 0.3,
  SNACK: 0.15,
};

@Injectable()
export class MealPlanService {
  constructor(private readonly prisma: PrismaService) {}

  /** What the user has logged so far today (Bangkok day). */
  async getTodayIntake(userId: string, now = new Date()) {
    const { start, end } = dayBounds(now);
    const logs = await this.prisma.foodLog.findMany({
      where: { userId, eatenAt: { gte: start, lt: end } },
      select: { foodName: true, calories: true, proteinG: true },
      orderBy: { eatenAt: 'asc' },
    });
    return {
      calories: logs.reduce((a, l) => a + l.calories, 0),
      proteinG: logs.reduce((a, l) => a + l.proteinG, 0),
      foods: logs.map((l) => l.foodName),
    };
  }

  async ensureTodayPlan(params: {
    userId: string;
    dailyCalories: number;
    dailyProteinG: number;
    dailyCarbsG: number;
    dailyFatG: number;
    planDate?: string;
  }) {
    const planDate = params.planDate ?? todayDateKey();
    const existing = await this.prisma.mealPlan.findUnique({
      where: { userId_planDate: { userId: params.userId, planDate } },
      include: { slots: true },
    });
    if (existing) return existing;

    const slots = (
      Object.keys(MEAL_ALLOCATION) as Array<keyof typeof MEAL_ALLOCATION>
    ).map((key) => {
      const ratio = MEAL_ALLOCATION[key];
      return {
        mealType: key,
        calorieTarget: Math.round(params.dailyCalories * ratio),
        proteinTargetG: Math.round(params.dailyProteinG * ratio * 10) / 10,
        carbsTargetG: Math.round(params.dailyCarbsG * ratio * 10) / 10,
        fatTargetG: Math.round(params.dailyFatG * ratio * 10) / 10,
      };
    });

    return this.prisma.mealPlan.create({
      data: {
        userId: params.userId,
        planDate,
        totalCalories: params.dailyCalories,
        totalProteinG: params.dailyProteinG,
        totalCarbsG: params.dailyCarbsG,
        totalFatG: params.dailyFatG,
        slots: { create: slots },
      },
      include: { slots: true },
    });
  }
}
