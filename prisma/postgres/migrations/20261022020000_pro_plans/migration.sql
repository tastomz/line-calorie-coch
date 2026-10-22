-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('NONE', 'PERCENT', 'AMOUNT');

-- CreateTable
CREATE TABLE "ProPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "labelTh" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "priceThb" INTEGER NOT NULL,
    "discountType" "DiscountType" NOT NULL DEFAULT 'NONE',
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "discountLabel" TEXT,
    "discountStartsAt" TIMESTAMP(3),
    "discountEndsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProPlan_code_key" ON "ProPlan"("code");

-- CreateIndex
CREATE INDEX "ProPlan_active_sortOrder_idx" ON "ProPlan"("active", "sortOrder");


-- Seed default packages (admin can edit later)
INSERT INTO "ProPlan" ("id", "code", "labelTh", "days", "priceThb", "sortOrder", "updatedAt") VALUES
  ('plan_1m', '1m', '1 เดือน', 30, 60, 10, CURRENT_TIMESTAMP),
  ('plan_3m', '3m', '3 เดือน', 90, 170, 20, CURRENT_TIMESTAMP),
  ('plan_6m', '6m', '6 เดือน', 180, 320, 30, CURRENT_TIMESTAMP),
  ('plan_12m', '12m', '12 เดือน', 365, 600, 40, CURRENT_TIMESTAMP);
