import { Injectable, NotFoundException } from '@nestjs/common';
import { FoodLog, MealType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { dayBounds } from './day-bounds';
import { FoodAnalysisResult } from './food-analysis.types';

export { dayBounds } from './day-bounds';

export type CreateFoodLogInput = {
  foodName: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  aiConfidence?: number;
  notes?: string;
  imageUrl?: string;
  mealType?: MealType;
  eatenAt?: Date;
};

export type FoodNutritionPatch = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

@Injectable()
export class FoodLogService {
  constructor(private readonly prisma: PrismaService) {}

  async createForUser(userId: string, input: CreateFoodLogInput) {
    return this.prisma.foodLog.create({
      data: {
        userId,
        eatenAt: input.eatenAt ?? new Date(),
        mealType: input.mealType ?? MealType.UNKNOWN,
        foodName: input.foodName,
        calories: input.calories,
        proteinG: input.proteinG,
        carbsG: input.carbsG,
        fatG: input.fatG,
        aiConfidence: input.aiConfidence,
        notes: input.notes,
        imageUrl: input.imageUrl,
      },
    });
  }

  async createFromAnalysis(
    userId: string,
    analysis: FoodAnalysisResult,
    options?: { imageUrl?: string; notes?: string },
  ) {
    return this.createForUser(userId, {
      foodName: analysis.foodName,
      calories: analysis.estimatedCalories,
      proteinG: analysis.proteinG,
      carbsG: analysis.carbsG,
      fatG: analysis.fatG,
      aiConfidence: analysis.confidence,
      imageUrl: options?.imageUrl,
      notes:
        options?.notes ??
        (analysis.assumptions.length
          ? analysis.assumptions.join('; ')
          : undefined),
    });
  }

  /** Always scoped by userId — never query FoodLog without it. */
  async findByIdForUser(userId: string, foodLogId: string) {
    const log = await this.prisma.foodLog.findFirst({
      where: { id: foodLogId, userId },
    });
    if (!log) {
      throw new NotFoundException('FoodLog not found');
    }
    return log;
  }

  /**
   * Today's FoodLog for this user only.
   * Returns null for missing / other-user / not-today — same safe miss.
   */
  async findTodayByIdForUser(
    userId: string,
    foodLogId: string,
    day: Date = new Date(),
  ): Promise<FoodLog | null> {
    const { start, end } = dayBounds(day);
    return this.prisma.foodLog.findFirst({
      where: {
        id: foodLogId,
        userId,
        eatenAt: { gte: start, lt: end },
      },
    });
  }

  async listForUserOnDate(userId: string, day: Date = new Date()) {
    const { start, end } = dayBounds(day);
    return this.prisma.foodLog.findMany({
      where: {
        userId,
        eatenAt: { gte: start, lt: end },
      },
      orderBy: { eatenAt: 'asc' },
    });
  }

  /** Update macros for today's own FoodLog. Safe not-found otherwise. */
  async updateNutritionForUserToday(
    userId: string,
    foodLogId: string,
    nutrition: FoodNutritionPatch,
    day: Date = new Date(),
  ): Promise<FoodLog> {
    const existing = await this.findTodayByIdForUser(userId, foodLogId, day);
    if (!existing) {
      throw new NotFoundException('FoodLog not found');
    }
    return this.prisma.foodLog.update({
      where: { id: existing.id },
      data: {
        calories: nutrition.calories,
        proteinG: nutrition.proteinG,
        carbsG: nutrition.carbsG,
        fatG: nutrition.fatG,
      },
    });
  }

  /** Replace name + nutrition after confirmed Food AI rename. */
  async replaceFromAnalysisForUserToday(
    userId: string,
    foodLogId: string,
    analysis: FoodAnalysisResult,
    day: Date = new Date(),
  ): Promise<FoodLog> {
    const existing = await this.findTodayByIdForUser(userId, foodLogId, day);
    if (!existing) {
      throw new NotFoundException('FoodLog not found');
    }
    return this.prisma.foodLog.update({
      where: { id: existing.id },
      data: {
        foodName: analysis.foodName,
        calories: analysis.estimatedCalories,
        proteinG: analysis.proteinG,
        carbsG: analysis.carbsG,
        fatG: analysis.fatG,
        aiConfidence: analysis.confidence,
        notes: analysis.assumptions.length
          ? analysis.assumptions.join('; ')
          : existing.notes,
      },
    });
  }

  /** Delete today's own FoodLog. Safe not-found otherwise. */
  async deleteForUserToday(
    userId: string,
    foodLogId: string,
    day: Date = new Date(),
  ): Promise<FoodLog> {
    const existing = await this.findTodayByIdForUser(userId, foodLogId, day);
    if (!existing) {
      throw new NotFoundException('FoodLog not found');
    }
    await this.prisma.foodLog.delete({ where: { id: existing.id } });
    return existing;
  }
}
