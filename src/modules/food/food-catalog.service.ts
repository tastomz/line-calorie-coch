import { Injectable, Logger } from '@nestjs/common';
import { FoodCatalogItem } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FoodAnalysisResult } from './food-analysis.types';

/** Shortest normalized text either side must share to count as a name match. */
const MIN_MATCH_LENGTH = 6;

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * Exact-dataset lookup for packaged convenience-store foods (see
 * docs/FOOD_CATALOG.md). Tried before AI for text input — a hit answers
 * instantly from a verified label, no OpenAI call or token cost.
 *
 * Deliberately conservative: an empty/ambiguous match falls through to AI
 * rather than guess. The table itself can be empty (no dataset imported
 * yet), in which case every lookup misses and nothing changes from before.
 */
@Injectable()
export class FoodCatalogService {
  private readonly logger = new Logger(FoodCatalogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds one confident name match for free text, or null.
   * Never throws — a DB hiccup here must not block food logging.
   */
  async findByText(text: string): Promise<FoodAnalysisResult | null> {
    const query = normalize(text);
    if (query.length < MIN_MATCH_LENGTH) {
      return null;
    }

    try {
      // Matching needs "does either name contain the other" in both
      // directions, which a single SQL `contains` can't express — the
      // catalog is small (hundreds of rows) so scanning it in memory is
      // cheap. Re-add DB-side filtering if the catalog grows much larger.
      const candidates = await this.prisma.foodCatalogItem.findMany();

      const matches = candidates.filter((item) =>
        this.isNameMatch(query, item),
      );
      if (matches.length !== 1) {
        // No match, or more than one candidate — never guess which one.
        return null;
      }
      return this.toAnalysisResult(matches[0]);
    } catch (error) {
      this.logger.warn(
        `Food catalog lookup failed, falling back to AI: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  private isNameMatch(normalizedQuery: string, item: FoodCatalogItem): boolean {
    const nameTh = normalize(item.nameTh);
    const nameEn = item.nameEn ? normalize(item.nameEn) : null;
    return (
      this.oneContainsOther(normalizedQuery, nameTh) ||
      (nameEn != null && this.oneContainsOther(normalizedQuery, nameEn))
    );
  }

  private oneContainsOther(a: string, b: string): boolean {
    if (a.length < MIN_MATCH_LENGTH || b.length < MIN_MATCH_LENGTH) {
      return false;
    }
    return a.includes(b) || b.includes(a);
  }

  private toAnalysisResult(item: FoodCatalogItem): FoodAnalysisResult {
    return {
      foodName: item.nameTh,
      estimatedCalories: item.energyKcal,
      proteinG: item.proteinG,
      carbsG: item.carbohydrateG,
      fatG: item.fatG,
      // Verified label data, not an AI guess.
      confidence: 1,
      assumptions: [],
      estimatedQuantity: item.servingQuantity,
      quantityUnit: 'serving',
    };
  }
}
