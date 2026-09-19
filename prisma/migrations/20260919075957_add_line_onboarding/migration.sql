-- CreateTable
CREATE TABLE "LineEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lineEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lineUserId" TEXT,
    "displayName" TEXT,
    "pictureUrl" TEXT,
    "onboardingState" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "draftSex" TEXT,
    "draftAge" INTEGER,
    "draftHeightCm" REAL,
    "draftCurrentWeightKg" REAL,
    "draftTargetWeightKg" REAL,
    "draftActivityLevel" TEXT,
    "draftGoal" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "displayName", "id", "lineUserId", "pictureUrl", "updatedAt") SELECT "createdAt", "displayName", "id", "lineUserId", "pictureUrl", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_lineUserId_key" ON "User"("lineUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "LineEvent_lineEventId_key" ON "LineEvent"("lineEventId");
