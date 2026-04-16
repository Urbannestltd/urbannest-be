-- AlterEnum
ALTER TYPE "UnitStatus" ADD VALUE 'DELETED';

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;
