-- CreateEnum
CREATE TYPE "AgentFeeStatus" AS ENUM ('PENDING_ADMIN_CONFIRMATION', 'CONFIRMED', 'REJECTED');

-- CreateTable
CREATE TABLE "agent_fees" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "AgentFeeStatus" NOT NULL DEFAULT 'PENDING_ADMIN_CONFIRMATION',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_fees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_fees_leadId_key" ON "agent_fees"("leadId");

-- CreateIndex
CREATE INDEX "agent_fees_agentId_idx" ON "agent_fees"("agentId");

-- CreateIndex
CREATE INDEX "agent_fees_status_idx" ON "agent_fees"("status");

-- AddForeignKey
ALTER TABLE "agent_fees" ADD CONSTRAINT "agent_fees_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_fees" ADD CONSTRAINT "agent_fees_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "agent_leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_fees" ADD CONSTRAINT "agent_fees_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
