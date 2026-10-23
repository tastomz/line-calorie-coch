-- CreateTable
CREATE TABLE "AiCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "model" TEXT,
    "lastOkAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
