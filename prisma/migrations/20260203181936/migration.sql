-- AlterEnum
ALTER TYPE "InviteStatus" ADD VALUE 'UPCOMING';

-- AlterTable
ALTER TABLE "MaintenanceRequest" ADD COLUMN     "subject" TEXT;
