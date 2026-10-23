-- AlterTable
ALTER TABLE "NutritionProfile" ADD COLUMN "startWeightKg" REAL;

-- Backfill: earliest logged weight, else the profile weight
UPDATE "NutritionProfile" SET "startWeightKg" = COALESCE(
  (SELECT "weightKg" FROM "WeightLog" WHERE "WeightLog"."userId" = "NutritionProfile"."userId" ORDER BY "recordedAt" ASC LIMIT 1),
  "currentWeightKg"
);
