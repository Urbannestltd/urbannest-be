-- Baseline migration: these objects already exist in the live database but
-- were never captured by a proper migration file (added via a direct schema
-- push at some point after 20260618000000_backfill_expense_categories).
-- This migration exists so a from-scratch replay (shadow DB / migrate dev /
-- migrate reset / a fresh environment) produces the same schema as production.
-- It is a no-op against the live database, which already has these objects.

-- CreateEnum
CREATE TYPE "AgentLeadStatus" AS ENUM ('PENDING', 'FORWARDED_TO_LANDLORD', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "VisitorInvite" ADD COLUMN     "visitorEmail" TEXT;

-- CreateTable
CREATE TABLE "agent_leads" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "prospectName" TEXT NOT NULL,
    "prospectEmail" TEXT,
    "prospectPhone" TEXT,
    "proposedRent" DOUBLE PRECISION,
    "notes" TEXT,
    "occupation" TEXT,
    "monthlyIncome" DOUBLE PRECISION,
    "employerName" TEXT,
    "employerAddress" TEXT,
    "documents" TEXT[],
    "status" "AgentLeadStatus" NOT NULL DEFAULT 'FORWARDED_TO_LANDLORD',
    "rejectionReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_leads_agentId_idx" ON "agent_leads"("agentId");

-- CreateIndex
CREATE INDEX "agent_leads_propertyId_idx" ON "agent_leads"("propertyId");

-- CreateIndex
CREATE INDEX "agent_leads_status_idx" ON "agent_leads"("status");

-- AddForeignKey
ALTER TABLE "agent_leads" ADD CONSTRAINT "agent_leads_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_leads" ADD CONSTRAINT "agent_leads_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_leads" ADD CONSTRAINT "agent_leads_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
