-- AlterEnum
ALTER TYPE "RoleType" ADD VALUE 'AGENT';

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "agentId" TEXT;

-- CreateIndex
CREATE INDEX "properties_agentId_idx" ON "properties"("agentId");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "user"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
