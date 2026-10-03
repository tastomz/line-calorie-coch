-- CreateTable
CREATE TABLE "ThaiFoodItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "servingUnit" TEXT NOT NULL,
    "servingDesc" TEXT,
    "servingGrams" REAL,
    "calories" REAL NOT NULL,
    "proteinG" REAL NOT NULL,
    "carbsG" REAL NOT NULL,
    "fatG" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "license" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ThaiFoodKey" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    CONSTRAINT "ThaiFoodKey_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ThaiFoodItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ThaiFoodItem_source_nameTh_key" ON "ThaiFoodItem"("source", "nameTh");

-- CreateIndex
CREATE INDEX "ThaiFoodKey_itemId_idx" ON "ThaiFoodKey"("itemId");
