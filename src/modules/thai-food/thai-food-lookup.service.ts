import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FOOD_QUANTITY_UNITS,
  FoodAnalysisResult,
  FoodQuantityUnit,
} from '../food/food-analysis.types';
import { quantityUnitLabelTh } from '../food/quantity-adjustment';
import { normalizeFoodKey, parseServingRequest } from './thai-food-key';

/** Curated reference data, not an estimate — but still not a measurement. */
export const THAI_FOOD_CONFIDENCE = 0.9;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isQuantityUnit(value: string): value is FoodQuantityUnit {
  return (FOOD_QUANTITY_UNITS as readonly string[]).includes(value);
}

/**
 * Exact-match lookup of common Thai dishes in the imported reference table.
 * Anything that is not clearly "one known dish + optional amount" returns null
 * so the AI path handles it — a wrong confident hit is worse than a miss.
 */
@Injectable()
export class ThaiFoodLookupService {
  private readonly logger = new Logger(ThaiFoodLookupService.name);

  constructor(private readonly prisma: PrismaService) {}

  async lookup(text: string): Promise<FoodAnalysisResult | null> {
    const request = parseServingRequest(text);
    if (!request) {
      return null;
    }

    const key = normalizeFoodKey(request.name);
    if (key.length < 2) {
      return null;
    }

    const row = await this.prisma.thaiFoodKey.findUnique({
      where: { key },
      include: { item: true },
    });
    if (!row) {
      return null;
    }

    const item = row.item;
    if (!isQuantityUnit(item.servingUnit)) {
      return null;
    }
    // "ข้าวมันไก่ 1 ชาม" when the data is per plate: do not convert silently.
    if (request.unit && request.unit !== item.servingUnit) {
      return null;
    }

    const servingLabel =
      item.servingDesc ?? `1 ${quantityUnitLabelTh(item.servingUnit)}`;
    this.logger.log(`Thai food DB hit itemId=${item.id}`);

    return {
      foodName: item.nameTh,
      estimatedCalories: round1(item.calories * request.quantity),
      proteinG: round1(item.proteinG * request.quantity),
      carbsG: round1(item.carbsG * request.quantity),
      fatG: round1(item.fatG * request.quantity),
      confidence: THAI_FOOD_CONFIDENCE,
      assumptions: [`ค่ามาตรฐาน ${servingLabel} · ${item.source}`],
      estimatedQuantity: request.quantity,
      quantityUnit: item.servingUnit,
    };
  }
}
