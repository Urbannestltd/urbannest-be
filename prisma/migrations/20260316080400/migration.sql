-- DropForeignKey
ALTER TABLE "properties" DROP CONSTRAINT "properties_landlordId_fkey";

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "facilityManagerId" TEXT,
ALTER COLUMN "landlordId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "user"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_facilityManagerId_fkey" FOREIGN KEY ("facilityManagerId") REFERENCES "user"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
