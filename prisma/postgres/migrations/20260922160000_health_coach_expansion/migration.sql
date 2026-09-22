-- CreateEnum
CREATE TYPE "HealthDataSource" AS ENUM ('MANUAL', 'BODY_SCAN', 'WEARABLE', 'AI_ESTIMATED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "ExerciseType" AS ENUM ('STRENGTH', 'RUNNING', 'WALKING', 'CYCLING', 'SWIMMING', 'SPORTS', 'MOBILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "MealPlanSlotStatus" AS ENUM ('PLANNED', 'DONE', 'SKIPPED');

-- AlterTable
ALTER TABLE "WeightLog" ADD COLUMN "source" "HealthDataSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "WeightLog" ADD COLUMN "bodyScanId" TEXT;

-- AlterTable
ALTER TABLE "AIUsage" ADD COLUMN "bodyScanCalls" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AIUsage" ADD COLUMN "mealPlanCalls" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AIUsage" ADD COLUMN "weeklyReviewCalls" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BodyScan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "source" "HealthDataSource" NOT NULL DEFAULT 'BODY_SCAN',
    "reportVendor" TEXT,
    "heightCm" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "bodyFatPercent" DOUBLE PRECISION,
    "bodyFatMassKg" DOUBLE PRECISION,
    "skeletalMuscleMassKg" DOUBLE PRECISION,
    "leanBodyMassKg" DOUBLE PRECISION,
    "visceralFatMassKg" DOUBLE PRECISION,
    "visceralFatAreaCm2" DOUBLE PRECISION,
    "totalBodyWaterKg" DOUBLE PRECISION,
    "waistCm" DOUBLE PRECISION,
    "waistToHipRatio" DOUBLE PRECISION,
    "bmrKcal" DOUBLE PRECISION,
    "teeKcal" DOUBLE PRECISION,
    "proteinMassKg" DOUBLE PRECISION,
    "mineralMassKg" DOUBLE PRECISION,
    "intracellularFluidKg" DOUBLE PRECISION,
    "extracellularFluidKg" DOUBLE PRECISION,
    "reportedCaloriesMin" INTEGER,
    "reportedCaloriesMax" INTEGER,
    "reportedProteinMinG" DOUBLE PRECISION,
    "reportedProteinMaxG" DOUBLE PRECISION,
    "reportedCarbsMinG" DOUBLE PRECISION,
    "reportedCarbsMaxG" DOUBLE PRECISION,
    "reportedFatMinG" DOUBLE PRECISION,
    "reportedFatMaxG" DOUBLE PRECISION,
    "reportReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BodyScan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PendingBodyScan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "imageUrl" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PendingBodyScan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SleepLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sleepDate" TEXT NOT NULL,
    "bedtime" TIMESTAMP(3) NOT NULL,
    "wakeTime" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "source" "HealthDataSource" NOT NULL DEFAULT 'MANUAL',
    "sleepScore" INTEGER,
    "deepSleepMinutes" INTEGER,
    "remSleepMinutes" INTEGER,
    "lightSleepMinutes" INTEGER,
    "awakeMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SleepLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExerciseLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "type" "ExerciseType" NOT NULL DEFAULT 'OTHER',
    "workoutName" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "caloriesBurned" DOUBLE PRECISION,
    "distanceKm" DOUBLE PRECISION,
    "sets" INTEGER,
    "reps" INTEGER,
    "intensity" TEXT,
    "heartRate" INTEGER,
    "source" "HealthDataSource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExerciseLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActivityDailyLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activityDate" TEXT NOT NULL,
    "steps" INTEGER NOT NULL DEFAULT 0,
    "activeMinutes" INTEGER,
    "distanceKm" DOUBLE PRECISION,
    "activeCalories" DOUBLE PRECISION,
    "source" "HealthDataSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ActivityDailyLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HydrationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "amountMl" INTEGER NOT NULL,
    "source" "HealthDataSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HydrationLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecoveryLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recoveryDate" TEXT NOT NULL,
    "energyScore" INTEGER NOT NULL,
    "stressScore" INTEGER NOT NULL,
    "recoveryScore" INTEGER NOT NULL,
    "sorenessScore" INTEGER NOT NULL,
    "notes" TEXT,
    "source" "HealthDataSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecoveryLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planDate" TEXT NOT NULL,
    "totalCalories" INTEGER NOT NULL,
    "totalProteinG" DOUBLE PRECISION NOT NULL,
    "totalCarbsG" DOUBLE PRECISION NOT NULL,
    "totalFatG" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MealPlanSlot" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "mealType" "MealType" NOT NULL,
    "calorieTarget" INTEGER NOT NULL,
    "proteinTargetG" DOUBLE PRECISION NOT NULL,
    "carbsTargetG" DOUBLE PRECISION NOT NULL,
    "fatTargetG" DOUBLE PRECISION NOT NULL,
    "plannedFood" TEXT,
    "status" "MealPlanSlotStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MealPlanSlot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WeeklyHealthReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStartDate" TEXT NOT NULL,
    "weekEndDate" TEXT NOT NULL,
    "metricsJson" TEXT NOT NULL,
    "aiSummary" TEXT,
    "focusJson" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeeklyHealthReview_pkey" PRIMARY KEY ("id")
);

-- indexes + FKs
CREATE INDEX "BodyScan_userId_measuredAt_idx" ON "BodyScan"("userId", "measuredAt");
CREATE UNIQUE INDEX "PendingBodyScan_userId_key" ON "PendingBodyScan"("userId");
CREATE INDEX "SleepLog_userId_sleepDate_idx" ON "SleepLog"("userId", "sleepDate");
CREATE INDEX "ExerciseLog_userId_performedAt_idx" ON "ExerciseLog"("userId", "performedAt");
CREATE UNIQUE INDEX "ActivityDailyLog_userId_activityDate_key" ON "ActivityDailyLog"("userId", "activityDate");
CREATE INDEX "ActivityDailyLog_userId_activityDate_idx" ON "ActivityDailyLog"("userId", "activityDate");
CREATE INDEX "HydrationLog_userId_recordedAt_idx" ON "HydrationLog"("userId", "recordedAt");
CREATE UNIQUE INDEX "RecoveryLog_userId_recoveryDate_key" ON "RecoveryLog"("userId", "recoveryDate");
CREATE INDEX "RecoveryLog_userId_recoveryDate_idx" ON "RecoveryLog"("userId", "recoveryDate");
CREATE UNIQUE INDEX "MealPlan_userId_planDate_key" ON "MealPlan"("userId", "planDate");
CREATE INDEX "MealPlan_userId_planDate_idx" ON "MealPlan"("userId", "planDate");
CREATE INDEX "MealPlanSlot_mealPlanId_idx" ON "MealPlanSlot"("mealPlanId");
CREATE UNIQUE INDEX "WeeklyHealthReview_userId_weekStartDate_key" ON "WeeklyHealthReview"("userId", "weekStartDate");
CREATE INDEX "WeeklyHealthReview_userId_weekStartDate_idx" ON "WeeklyHealthReview"("userId", "weekStartDate");

ALTER TABLE "BodyScan" ADD CONSTRAINT "BodyScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PendingBodyScan" ADD CONSTRAINT "PendingBodyScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SleepLog" ADD CONSTRAINT "SleepLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExerciseLog" ADD CONSTRAINT "ExerciseLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityDailyLog" ADD CONSTRAINT "ActivityDailyLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HydrationLog" ADD CONSTRAINT "HydrationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoveryLog" ADD CONSTRAINT "RecoveryLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealPlanSlot" ADD CONSTRAINT "MealPlanSlot_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyHealthReview" ADD CONSTRAINT "WeeklyHealthReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
