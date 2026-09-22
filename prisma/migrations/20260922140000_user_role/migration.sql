-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lineUserId" TEXT,
    "displayName" TEXT,
    "pictureUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
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
INSERT INTO "new_User" ("id", "lineUserId", "displayName", "pictureUrl", "onboardingState", "draftSex", "draftAge", "draftHeightCm", "draftCurrentWeightKg", "draftTargetWeightKg", "draftActivityLevel", "draftGoal", "createdAt", "updatedAt")
SELECT "id", "lineUserId", "displayName", "pictureUrl", "onboardingState", "draftSex", "draftAge", "draftHeightCm", "draftCurrentWeightKg", "draftTargetWeightKg", "draftActivityLevel", "draftGoal", "createdAt", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_lineUserId_key" ON "User"("lineUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
