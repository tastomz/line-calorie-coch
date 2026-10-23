-- CreateTable
CREATE TABLE "RichMenuImage" (
    "tab" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RichMenuImage_pkey" PRIMARY KEY ("tab")
);
