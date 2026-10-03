-- CreateTable
CREATE TABLE "ThaiFoodItem" (
    "id" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "servingUnit" TEXT NOT NULL,
    "servingDesc" TEXT,
    "servingGrams" DOUBLE PRECISION,
    "calories" DOUBLE PRECISION NOT NULL,
    "proteinG" DOUBLE PRECISION NOT NULL,
    "carbsG" DOUBLE PRECISION NOT NULL,
    "fatG" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "license" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThaiFoodItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThaiFoodKey" (
    "key" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "ThaiFoodKey_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "ThaiFoodItem_source_nameTh_key" ON "ThaiFoodItem"("source", "nameTh");

-- CreateIndex
CREATE INDEX "ThaiFoodKey_itemId_idx" ON "ThaiFoodKey"("itemId");

-- AddForeignKey
ALTER TABLE "ThaiFoodKey" ADD CONSTRAINT "ThaiFoodKey_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ThaiFoodItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

