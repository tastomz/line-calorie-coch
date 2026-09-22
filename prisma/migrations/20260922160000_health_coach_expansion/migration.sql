-- Health coach expansion (SQLite)

-- AlterTable WeightLog
ALTER TABLE "WeightLog" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "WeightLog" ADD COLUMN "bodyScanId" TEXT;

-- AlterTable AIUsage
ALTER TABLE "AIUsage" ADD COLUMN "bodyScanCalls" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AIUsage" ADD COLUMN "mealPlanCalls" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AIUsage" ADD COLUMN "weeklyReviewCalls" INTEGER NOT NULL DEFAULT 0;

-- CreateTable BodyScan
CREATE TABLE "BodyScan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "measuredAt" DATETIME NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'BODY_SCAN',
    "reportVendor" TEXT,
    "heightCm" REAL,
    "weightKg" REAL,
    "bodyFatPercent" REAL,
    "bodyFatMassKg" REAL,
    "skeletalMuscleMassKg" REAL,
    "leanBodyMassKg" REAL,
    "visceralFatMassKg" REAL,
    "visceralFatAreaCm2" REAL,
    "totalBodyWaterKg" REAL,
    "waistCm" REAL,
    "waistToHipRatio" REAL,
    "bmrKcal" REAL,
    "teeKcal" REAL,
    "proteinMassKg" REAL,
    "mineralMassKg" REAL,
    "intracellularFluidKg" REAL,
    "extracellularFluidKg" REAL,
    "reportedCaloriesMin" INTEGER,
    "reportedCaloriesMax" INTEGER,
    "reportedProteinMinG" REAL,
    "reportedProteinMaxG" REAL,
    "reportedCarbsMinG" REAL,
    "reportedCarbsMaxG" REAL,
    "reportedFatMinG" REAL,
    "reportedFatMaxG" REAL,
    "reportReference" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BodyScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "BodyScan_userId_measuredAt_idx" ON "BodyScan"("userId", "measuredAt");

-- CreateTable PendingBodyScan
CREATE TABLE "PendingBodyScan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "imageUrl" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PendingBodyScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PendingBodyScan_userId_key" ON "PendingBodyScan"("userId");

-- CreateTable SleepLog
CREATE TABLE "SleepLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sleepDate" TEXT NOT NULL,
    "bedtime" DATETIME NOT NULL,
    "wakeTime" DATETIME NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sleepScore" INTEGER,
    "deepSleepMinutes" INTEGER,
    "remSleepMinutes" INTEGER,
    "lightSleepMinutes" INTEGER,
    "awakeMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SleepLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SleepLog_userId_sleepDate_idx" ON "SleepLog"("userId", "sleepDate");

-- CreateTable ExerciseLog
CREATE TABLE "ExerciseLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "performedAt" DATETIME NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "workoutName" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "caloriesBurned" REAL,
    "distanceKm" REAL,
    "sets" INTEGER,
    "reps" INTEGER,
    "intensity" TEXT,
    "heartRate" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExerciseLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ExerciseLog_userId_performedAt_idx" ON "ExerciseLog"("userId", "performedAt");

-- CreateTable ActivityDailyLog
CREATE TABLE "ActivityDailyLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "activityDate" TEXT NOT NULL,
    "steps" INTEGER NOT NULL DEFAULT 0,
    "activeMinutes" INTEGER,
    "distanceKm" REAL,
    "activeCalories" REAL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActivityDailyLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ActivityDailyLog_userId_activityDate_key" ON "ActivityDailyLog"("userId", "activityDate");
CREATE INDEX "ActivityDailyLog_userId_activityDate_idx" ON "ActivityDailyLog"("userId", "activityDate");

-- CreateTable HydrationLog
CREATE TABLE "HydrationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL,
    "amountMl" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HydrationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "HydrationLog_userId_recordedAt_idx" ON "HydrationLog"("userId", "recordedAt");

-- CreateTable RecoveryLog
CREATE TABLE "RecoveryLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "recoveryDate" TEXT NOT NULL,
    "energyScore" INTEGER NOT NULL,
    "stressScore" INTEGER NOT NULL,
    "recoveryScore" INTEGER NOT NULL,
    "sorenessScore" INTEGER NOT NULL,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecoveryLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RecoveryLog_userId_recoveryDate_key" ON "RecoveryLog"("userId", "recoveryDate");
CREATE INDEX "RecoveryLog_userId_recoveryDate_idx" ON "RecoveryLog"("userId", "recoveryDate");

-- CreateTable MealPlan
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "planDate" TEXT NOT NULL,
    "totalCalories" INTEGER NOT NULL,
    "totalProteinG" REAL NOT NULL,
    "totalCarbsG" REAL NOT NULL,
    "totalFatG" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MealPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MealPlan_userId_planDate_key" ON "MealPlan"("userId", "planDate");
CREATE INDEX "MealPlan_userId_planDate_idx" ON "MealPlan"("userId", "planDate");

-- CreateTable MealPlanSlot
CREATE TABLE "MealPlanSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mealPlanId" TEXT NOT NULL,
    "mealType" TEXT NOT NULL,
    "calorieTarget" INTEGER NOT NULL,
    "proteinTargetG" REAL NOT NULL,
    "carbsTargetG" REAL NOT NULL,
    "fatTargetG" REAL NOT NULL,
    "plannedFood" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MealPlanSlot_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MealPlanSlot_mealPlanId_idx" ON "MealPlanSlot"("mealPlanId");

-- CreateTable WeeklyHealthReview
CREATE TABLE "WeeklyHealthReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "weekStartDate" TEXT NOT NULL,
    "weekEndDate" TEXT NOT NULL,
    "metricsJson" TEXT NOT NULL,
    "aiSummary" TEXT,
    "focusJson" TEXT,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeeklyHealthReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WeeklyHealthReview_userId_weekStartDate_key" ON "WeeklyHealthReview"("userId", "weekStartDate");
CREATE INDEX "WeeklyHealthReview_userId_weekStartDate_idx" ON "WeeklyHealthReview"("userId", "weekStartDate");
