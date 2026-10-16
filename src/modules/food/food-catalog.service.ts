import { Injectable, Logger } from '@nestjs/common';
import { FoodCatalogItem } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FoodAnalysisResult } from './food-analysis.types';

/** Shortest normalized text either side must share to count as a name match. */
const MIN_MATCH_LENGTH = 6;

/**
 * Shortest normalized brand word for the fallback brand-only match (e.g.
 * "เลย์" alone, not the full printed product name). Shorter than
 * MIN_MATCH_LENGTH because real brand words are short, but the fallback
 * only fires when exactly one catalog item carries that brand word, so a
 * short word is still safe — ambiguous brands fall through to AI.
 */
const MIN_BRAND_MATCH_LENGTH = 3;

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
    if (query.length < MIN_BRAND_MATCH_LENGTH) {
      return null;
    }

    try {
      // Matching needs "does either name contain the other" in both
      // directions, which a single SQL `contains` can't express — the
      // catalog is small (hundreds of rows) so scanning it in memory is
      // cheap. Re-add DB-side filtering if the catalog grows much larger.
      const candidates = await this.prisma.foodCatalogItem.findMany();

      const fullMatches = candidates.filter((item) =>
        this.isNameMatch(query, item),
      );
      if (fullMatches.length === 1) {
        return this.toAnalysisResult(fullMatches[0]);
      }
      if (fullMatches.length > 1) {
        // Ambiguous full-name match — never guess which one.
        return null;
      }

      // Nobody's full printed name is in the text — real users type just
      // the brand ("เลย์", not the full label). Fall back to matching the
      // catalog name's first word, but only act when exactly one item
      // carries that brand: if several share it, that's still ambiguous.
      const brandMatches = candidates.filter((item) =>
        this.isBrandMatch(query, item),
      );
      if (brandMatches.length !== 1) {
        return null;
      }
      return this.toAnalysisResult(brandMatches[0]);
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

  private isBrandMatch(
    normalizedQuery: string,
    item: FoodCatalogItem,
  ): boolean {
    return (
      this.brandWordMatches(normalizedQuery, item.nameTh) ||
      (item.nameEn != null &&
        this.brandWordMatches(normalizedQuery, item.nameEn))
    );
  }

  /** The catalog name's first word, e.g. "เลย์" from "เลย์ มันฝรั่ง...". */
  private brandWordMatches(normalizedQuery: string, name: string): boolean {
    const brandWord = normalize(name.trim().split(/\s+/)[0] ?? '');
    if (brandWord.length < MIN_BRAND_MATCH_LENGTH) {
      return false;
    }
    return normalizedQuery.includes(brandWord);
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
