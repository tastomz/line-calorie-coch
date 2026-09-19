-- AlterTable
ALTER TABLE "PendingFoodAnalysis" ADD COLUMN "consumedQuantity" REAL;
ALTER TABLE "PendingFoodAnalysis" ADD COLUMN "originalCalories" REAL;
ALTER TABLE "PendingFoodAnalysis" ADD COLUMN "originalCarbsG" REAL;
ALTER TABLE "PendingFoodAnalysis" ADD COLUMN "originalFatG" REAL;
ALTER TABLE "PendingFoodAnalysis" ADD COLUMN "originalProteinG" REAL;
ALTER TABLE "PendingFoodAnalysis" ADD COLUMN "originalQuantity" REAL;
ALTER TABLE "PendingFoodAnalysis" ADD COLUMN "quantityUnit" TEXT;
