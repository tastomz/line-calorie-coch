/*
  Warnings:

  - You are about to drop the `ThaiFoodItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ThaiFoodKey` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ThaiFoodItem";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ThaiFoodKey";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "FoodCatalogItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "sourceFoodId" TEXT NOT NULL,
    "retailer" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "servingLabel" TEXT,
    "servingQuantity" REAL NOT NULL,
    "servingWeightG" REAL,
    "servingVolumeMl" REAL,
    "energyKcal" REAL NOT NULL,
    "proteinG" REAL NOT NULL,
    "carbohydrateG" REAL NOT NULL,
    "fatG" REAL NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceReferencesJson" TEXT NOT NULL,
    "servingOptionsJson" TEXT NOT NULL,
    "qualityFlagsJson" TEXT NOT NULL,
    "retrievedAt" DATETIME NOT NULL,
    "labelVerifiedAt" DATETIME,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "FoodCatalogItem_nameTh_idx" ON "FoodCatalogItem"("nameTh");

-- CreateIndex
CREATE UNIQUE INDEX "FoodCatalogItem_source_sourceFoodId_key" ON "FoodCatalogItem"("source", "sourceFoodId");
