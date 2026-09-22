-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "provider" TEXT NOT NULL DEFAULT 'NONE',
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "trialStartedAt" DATETIME,
    "trialEndsAt" DATETIME,
    "startedAt" DATETIME,
    "currentPeriodStart" DATETIME,
    "currentPeriodEnd" DATETIME,
    "canceledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "trialDays" INTEGER NOT NULL,
    "maxRedemptions" INTEGER,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PromoRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redeemedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "PromoRedemption_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PromoRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AIUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "usageDate" TEXT NOT NULL,
    "foodTextCalls" INTEGER NOT NULL DEFAULT 0,
    "visionCalls" INTEGER NOT NULL DEFAULT 0,
    "adjustmentCalls" INTEGER NOT NULL DEFAULT 0,
    "coachCalls" INTEGER NOT NULL DEFAULT 0,
    "classifyCalls" INTEGER NOT NULL DEFAULT 0,
    "totalCalls" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AIUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");

-- CreateIndex
CREATE INDEX "Subscription_userId_plan_idx" ON "Subscription"("userId", "plan");

-- CreateIndex
CREATE INDEX "Subscription_providerSubscriptionId_idx" ON "Subscription"("providerSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoRedemption_userId_idx" ON "PromoRedemption"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoRedemption_promoCodeId_userId_key" ON "PromoRedemption"("promoCodeId", "userId");

-- CreateIndex
CREATE INDEX "AIUsage_usageDate_idx" ON "AIUsage"("usageDate");

-- CreateIndex
CREATE UNIQUE INDEX "AIUsage_userId_usageDate_key" ON "AIUsage"("userId", "usageDate");
