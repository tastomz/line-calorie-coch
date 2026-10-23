-- CreateTable
CREATE TABLE "AiCredential" (
    "id" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "model" TEXT,
    "lastOkAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCredential_pkey" PRIMARY KEY ("id")
);
