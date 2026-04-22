-- CreateEnum
CREATE TYPE "MaintenanceApprovalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REBUTTAL_SENT');

-- AlterTable
ALTER TABLE "MaintenanceRequest" ADD COLUMN     "approvalStatus" "MaintenanceApprovalStatus",
ADD COLUMN     "budget" DOUBLE PRECISION,
ADD COLUMN     "quotedCost" DOUBLE PRECISION,
ADD COLUMN     "rebuttalNote" TEXT;
