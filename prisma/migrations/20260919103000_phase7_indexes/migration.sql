-- Phase 7 Part 2: indexes for expiry sweeps and LineEvent cleanup.
-- Existing unique indexes already cover:
--   User.lineUserId
--   FoodLog(userId, eatenAt)
--   WeightLog(userId, recordedAt)
--   LineEvent.lineEventId
--   PendingFoodAnalysis.userId

CREATE INDEX "PendingFoodAnalysis_expiresAt_idx" ON "PendingFoodAnalysis"("expiresAt");
CREATE INDEX "LineEvent_processedAt_idx" ON "LineEvent"("processedAt");
