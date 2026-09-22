-- CreateTable
CREATE TABLE "AiCallLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "usageDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiCallLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiCallLog_usageDate_idx" ON "AiCallLog"("usageDate");
CREATE INDEX "AiCallLog_userId_usageDate_idx" ON "AiCallLog"("userId", "usageDate");
CREATE INDEX "AiCallLog_operation_usageDate_idx" ON "AiCallLog"("operation", "usageDate");
CREATE INDEX "AiCallLog_model_usageDate_idx" ON "AiCallLog"("model", "usageDate");
CREATE INDEX "AiCallLog_createdAt_idx" ON "AiCallLog"("createdAt");

ALTER TABLE "AiCallLog" ADD CONSTRAINT "AiCallLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
