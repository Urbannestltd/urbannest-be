-- AlterEnum
ALTER TYPE "RoleType" ADD VALUE 'FRONT_DESK';

-- AlterTable
ALTER TABLE "VisitorInvite" ADD COLUMN     "registeredByFdId" TEXT;

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "frontDeskId" TEXT;

-- CreateIndex
CREATE INDEX "VisitorInvite_registeredByFdId_idx" ON "VisitorInvite"("registeredByFdId");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_frontDeskId_fkey" FOREIGN KEY ("frontDeskId") REFERENCES "user"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorInvite" ADD CONSTRAINT "VisitorInvite_registeredByFdId_fkey" FOREIGN KEY ("registeredByFdId") REFERENCES "user"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
