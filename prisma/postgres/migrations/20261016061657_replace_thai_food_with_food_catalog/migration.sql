/*
  Warnings:

  - You are about to drop the `ThaiFoodItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ThaiFoodKey` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ThaiFoodKey" DROP CONSTRAINT "ThaiFoodKey_itemId_fkey";

-- DropTable
DROP TABLE "ThaiFoodItem";

-- DropTable
DROP TABLE "ThaiFoodKey";

-- CreateTable
CREATE TABLE "FoodCatalogItem" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceFoodId" TEXT NOT NULL,
    "retailer" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "servingLabel" TEXT,
    "servingQuantity" DOUBLE PRECISION NOT NULL,
    "servingWeightG" DOUBLE PRECISION,
    "servingVolumeMl" DOUBLE PRECISION,
    "energyKcal" DOUBLE PRECISION NOT NULL,
    "proteinG" DOUBLE PRECISION NOT NULL,
    "carbohydrateG" DOUBLE PRECISION NOT NULL,
    "fatG" DOUBLE PRECISION NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceReferencesJson" TEXT NOT NULL,
    "servingOptionsJson" TEXT NOT NULL,
    "qualityFlagsJson" TEXT NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "labelVerifiedAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodCatalogItem_nameTh_idx" ON "FoodCatalogItem"("nameTh");

-- CreateIndex
CREATE UNIQUE INDEX "FoodCatalogItem_source_sourceFoodId_key" ON "FoodCatalogItem"("source", "sourceFoodId");
