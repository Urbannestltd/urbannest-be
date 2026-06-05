-- CreateEnum
CREATE TYPE "AgentVisitStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'RESCHEDULED_PENDING_AGENT', 'CANCELLED');

-- CreateTable
CREATE TABLE "agent_visits" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "purpose" TEXT,
    "notes" TEXT,
    "status" "AgentVisitStatus" NOT NULL DEFAULT 'PENDING',
    "proposedDate" TIMESTAMP(3),
    "proposedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_visits_agentId_idx" ON "agent_visits"("agentId");

-- CreateIndex
CREATE INDEX "agent_visits_propertyId_idx" ON "agent_visits"("propertyId");

-- CreateIndex
CREATE INDEX "agent_visits_status_idx" ON "agent_visits"("status");

-- AddForeignKey
ALTER TABLE "agent_visits" ADD CONSTRAINT "agent_visits_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_visits" ADD CONSTRAINT "agent_visits_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_visits" ADD CONSTRAINT "agent_visits_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_visits" ADD CONSTRAINT "agent_visits_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "user"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
