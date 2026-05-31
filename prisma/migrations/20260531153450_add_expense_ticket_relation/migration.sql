-- AlterEnum
ALTER TYPE "InviteFrequency" ADD VALUE 'ONE_OFF_AGENT';

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "maintenanceRequestId" TEXT;

-- CreateIndex
CREATE INDEX "expenses_maintenanceRequestId_idx" ON "expenses"("maintenanceRequestId");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_maintenanceRequestId_fkey" FOREIGN KEY ("maintenanceRequestId") REFERENCES "MaintenanceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
