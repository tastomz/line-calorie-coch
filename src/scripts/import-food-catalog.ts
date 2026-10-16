/**
 * Import a vetted food-catalog dataset (see prisma/seed-data/*.json) into
 * FoodCatalogItem. Upserts by (source, sourceFoodId) — safe to re-run.
 *
 * Usage:
 *   npm run import:food-catalog -- prisma/seed-data/food-catalog-7eleven.json
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';

type RawFoodCatalogItem = {
  source: string;
  source_food_id: string;
  retailer: string;
  name_th: string;
  name_en: string | null;
  serving_label: string | null;
  serving_quantity: number;
  serving_weight_g: number | null;
  serving_volume_ml: number | null;
  energy_kcal: number;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
  source_url: string;
  source_references: unknown[];
  serving_options: unknown[];
  quality_flags: string[];
  retrieved_at: string;
  label_verified_at: string | null;
};

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error(
      'Usage: import-food-catalog <path-to-json> (e.g. prisma/seed-data/food-catalog-7eleven.json)',
    );
  }

  const raw = readFileSync(resolve(filePath), 'utf8');
  const items = JSON.parse(raw) as RawFoodCatalogItem[];

  const prisma = new PrismaClient();
  try {
    for (const item of items) {
      const data = {
        source: item.source,
        sourceFoodId: item.source_food_id,
        retailer: item.retailer,
        nameTh: item.name_th,
        nameEn: item.name_en,
        servingLabel: item.serving_label,
        servingQuantity: item.serving_quantity,
        servingWeightG: item.serving_weight_g,
        servingVolumeMl: item.serving_volume_ml,
        energyKcal: item.energy_kcal,
        proteinG: item.protein_g,
        carbohydrateG: item.carbohydrate_g,
        fatG: item.fat_g,
        sourceUrl: item.source_url,
        sourceReferencesJson: JSON.stringify(item.source_references),
        servingOptionsJson: JSON.stringify(item.serving_options),
        qualityFlagsJson: JSON.stringify(item.quality_flags),
        retrievedAt: new Date(item.retrieved_at),
        labelVerifiedAt: item.label_verified_at
          ? new Date(item.label_verified_at)
          : null,
      };
      await prisma.foodCatalogItem.upsert({
        where: {
          source_sourceFoodId: {
            source: item.source,
            sourceFoodId: item.source_food_id,
          },
        },
        create: data,
        update: data,
      });
    }
    console.log(JSON.stringify({ ok: true, processed: items.length }));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : 'unknown error',
    }),
  );
  process.exitCode = 1;
});
