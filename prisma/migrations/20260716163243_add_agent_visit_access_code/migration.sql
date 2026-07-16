-- AlterEnum
ALTER TYPE "AgentVisitStatus" ADD VALUE 'CHECKED_IN';

-- AlterTable
ALTER TABLE "agent_visits" ADD COLUMN     "accessCode" TEXT,
ADD COLUMN     "checkedInAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "agent_visits_accessCode_key" ON "agent_visits"("accessCode");
