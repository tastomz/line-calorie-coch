import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FoodLog, PendingFoodAnalysis } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FoodAnalysisResult } from './food-analysis.types';
import {
  applyProportionalNutrition,
  NutritionValues,
} from './quantity-adjustment';

const PENDING_TTL_MS = 30 * 60 * 1000;

export class PendingFoodConfirmError extends Error {
  constructor(
    message: string,
    readonly code:
      'not_found' | 'expired' | 'already_consumed' | 'forbidden' = 'not_found',
  ) {
    super(message);
    this.name = 'PendingFoodConfirmError';
  }
}

@Injectable()
export class PendingFoodService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * V1: one pending analysis per user.
   * A new food analysis replaces any existing pending item.
   */
  async upsertPending(
    userId: string,
    analysis: FoodAnalysisResult,
    imageUrl?: string,
  ) {
    const expiresAt = new Date(Date.now() + PENDING_TTL_MS);
    const assumptions = JSON.stringify(analysis.assumptions);

    return this.prisma.pendingFoodAnalysis.upsert({
      where: { userId },
      create: {
        userId,
        foodName: analysis.foodName,
        calories: analysis.estimatedCalories,
        proteinG: analysis.proteinG,
        carbsG: analysis.carbsG,
        fatG: analysis.fatG,
        confidence: analysis.confidence,
        assumptions,
        imageUrl,
        originalQuantity: analysis.estimatedQuantity,
        quantityUnit: analysis.quantityUnit,
        consumedQuantity: analysis.estimatedQuantity,
        originalCalories: analysis.estimatedCalories,
        originalProteinG: analysis.proteinG,
        originalCarbsG: analysis.carbsG,
        originalFatG: analysis.fatG,
        expiresAt,
      },
      update: {
        foodName: analysis.foodName,
        calories: analysis.estimatedCalories,
        proteinG: analysis.proteinG,
        carbsG: analysis.carbsG,
        fatG: analysis.fatG,
        confidence: analysis.confidence,
        assumptions,
        imageUrl: imageUrl ?? null,
        originalQuantity: analysis.estimatedQuantity,
        quantityUnit: analysis.quantityUnit,
        consumedQuantity: analysis.estimatedQuantity,
        originalCalories: analysis.estimatedCalories,
        originalProteinG: analysis.proteinG,
        originalCarbsG: analysis.carbsG,
        originalFatG: analysis.fatG,
        expiresAt,
        createdAt: new Date(),
      },
    });
  }

  async applyConsumedQuantity(userId: string, consumedQuantity: number) {
    const pending = await this.requireActiveForUser(userId);
    const originalQty = pending.originalQuantity ?? 1;
    const original = this.originalNutrition(pending);
    const ratio = consumedQuantity / originalQty;
    const adjusted = applyProportionalNutrition(original, ratio);

    return this.prisma.pendingFoodAnalysis.update({
      where: { userId },
      data: {
        consumedQuantity,
        calories: adjusted.calories,
        proteinG: adjusted.proteinG,
        carbsG: adjusted.carbsG,
        fatG: adjusted.fatG,
      },
    });
  }

  /**
   * Override displayed calories while keeping macros proportionally scaled
   * from the current pending values (deterministic edit-before-save).
   */
  async applyCalorieOverride(userId: string, calories: number) {
    const pending = await this.requireActiveForUser(userId);
    const currentCal = pending.calories || 1;
    const ratio = calories / currentCal;
    const adjusted = applyProportionalNutrition(
      {
        calories: pending.calories,
        proteinG: pending.proteinG,
        carbsG: pending.carbsG,
        fatG: pending.fatG,
      },
      ratio,
    );

    return this.prisma.pendingFoodAnalysis.update({
      where: { userId },
      data: {
        calories: adjusted.calories,
        proteinG: adjusted.proteinG,
        carbsG: adjusted.carbsG,
        fatG: adjusted.fatG,
      },
    });
  }

  async restoreOriginalQuantity(userId: string) {
    const pending = await this.requireActiveForUser(userId);
    return this.prisma.pendingFoodAnalysis.update({
      where: { userId },
      data: {
        consumedQuantity: pending.originalQuantity,
        calories: pending.originalCalories ?? pending.calories,
        proteinG: pending.originalProteinG ?? pending.proteinG,
        carbsG: pending.originalCarbsG ?? pending.carbsG,
        fatG: pending.originalFatG ?? pending.fatG,
      },
    });
  }

  async replaceWithCompositionAnalysis(
    userId: string,
    analysis: FoodAnalysisResult,
  ) {
    const pending = await this.requireActiveForUser(userId);
    return this.prisma.pendingFoodAnalysis.update({
      where: { userId },
      data: {
        foodName: analysis.foodName,
        calories: analysis.estimatedCalories,
        proteinG: analysis.proteinG,
        carbsG: analysis.carbsG,
        fatG: analysis.fatG,
        confidence: analysis.confidence,
        assumptions: JSON.stringify(analysis.assumptions),
        originalQuantity: analysis.estimatedQuantity,
        quantityUnit: analysis.quantityUnit,
        consumedQuantity: analysis.estimatedQuantity,
        originalCalories: analysis.estimatedCalories,
        originalProteinG: analysis.proteinG,
        originalCarbsG: analysis.carbsG,
        originalFatG: analysis.fatG,
        imageUrl: pending.imageUrl,
        expiresAt: new Date(Date.now() + PENDING_TTL_MS),
      },
    });
  }

  async getActiveForUser(userId: string) {
    const pending = await this.prisma.pendingFoodAnalysis.findUnique({
      where: { userId },
    });
    if (!pending) {
      return null;
    }
    if (pending.expiresAt.getTime() < Date.now()) {
      await this.clearForUser(userId);
      return null;
    }
    return pending;
  }

  async requireActiveForUser(userId: string) {
    const pending = await this.getActiveForUser(userId);
    if (!pending) {
      throw new NotFoundException('No pending food analysis to confirm');
    }
    if (pending.userId !== userId) {
      throw new ForbiddenException(
        'Pending food analysis does not belong to user',
      );
    }
    return pending;
  }

  async clearForUser(userId: string) {
    await this.prisma.pendingFoodAnalysis.deleteMany({ where: { userId } });
  }

  /**
   * Atomically consume pending analysis and create FoodLog.
   * Same pending row cannot produce two FoodLogs under concurrent confirms.
   */
  async confirmPendingAtomic(userId: string): Promise<{
    foodLog: FoodLog;
    analysis: FoodAnalysisResult;
    pendingId: string;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const pending = await tx.pendingFoodAnalysis.findUnique({
        where: { userId },
      });

      if (!pending) {
        throw new PendingFoodConfirmError(
          'No pending food analysis to confirm',
          'not_found',
        );
      }
      if (pending.userId !== userId) {
        throw new PendingFoodConfirmError(
          'Pending food analysis does not belong to user',
          'forbidden',
        );
      }
      if (pending.expiresAt.getTime() < Date.now()) {
        await tx.pendingFoodAnalysis.deleteMany({ where: { userId } });
        throw new PendingFoodConfirmError(
          'Pending food analysis expired',
          'expired',
        );
      }

      // Delete first inside the transaction — second concurrent confirm
      // will see not_found (SQLite serializes writers).
      const deleted = await tx.pendingFoodAnalysis.deleteMany({
        where: { id: pending.id, userId },
      });
      if (deleted.count !== 1) {
        throw new PendingFoodConfirmError(
          'Pending food analysis already consumed',
          'already_consumed',
        );
      }

      const analysis = this.toAnalysisResult(pending);
      const quantityNote = this.quantityNotes(pending);
      const notes = [
        quantityNote,
        analysis.assumptions.length
          ? analysis.assumptions.join('; ')
          : undefined,
      ]
        .filter(Boolean)
        .join(' | ');

      const foodLog = await tx.foodLog.create({
        data: {
          userId,
          eatenAt: new Date(),
          foodName: analysis.foodName,
          calories: analysis.estimatedCalories,
          proteinG: analysis.proteinG,
          carbsG: analysis.carbsG,
          fatG: analysis.fatG,
          aiConfidence: analysis.confidence,
          imageUrl: pending.imageUrl,
          notes: notes || undefined,
        },
      });

      return { foodLog, analysis, pendingId: pending.id };
    });
  }

  toAnalysisResult(pending: PendingFoodAnalysis): FoodAnalysisResult {
    let assumptions: string[] = [];
    try {
      const parsed: unknown = JSON.parse(pending.assumptions);
      if (Array.isArray(parsed)) {
        assumptions = parsed.filter(
          (item): item is string => typeof item === 'string',
        );
      }
    } catch {
      assumptions = [];
    }

    return {
      foodName: pending.foodName,
      estimatedCalories: pending.calories,
      proteinG: pending.proteinG,
      carbsG: pending.carbsG,
      fatG: pending.fatG,
      confidence: pending.confidence,
      assumptions,
      estimatedQuantity:
        pending.consumedQuantity ?? pending.originalQuantity ?? 1,
      quantityUnit: pending.quantityUnit ?? 'serving',
    };
  }

  quantityNotes(pending: PendingFoodAnalysis): string | undefined {
    const unit = pending.quantityUnit ?? 'serving';
    const consumed = pending.consumedQuantity;
    const original = pending.originalQuantity;
    if (consumed == null || original == null) {
      return undefined;
    }
    return `consumed ${consumed}/${original} ${unit}`;
  }

  private originalNutrition(pending: PendingFoodAnalysis): NutritionValues {
    return {
      calories: pending.originalCalories ?? pending.calories,
      proteinG: pending.originalProteinG ?? pending.proteinG,
      carbsG: pending.originalCarbsG ?? pending.carbsG,
      fatG: pending.originalFatG ?? pending.fatG,
    };
  }
}
