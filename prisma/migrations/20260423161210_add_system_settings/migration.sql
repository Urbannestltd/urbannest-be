-- CreateTable
CREATE TABLE "system_setting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "defaultMaintenanceBudget" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_setting_pkey" PRIMARY KEY ("id")
);
