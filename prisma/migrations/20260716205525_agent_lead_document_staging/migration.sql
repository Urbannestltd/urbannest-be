-- Allow AgentLeadDocument to exist without a lead (staged/unattached uploads),
-- scoped instead by the uploading agent.

-- 1. Add agentId as nullable first so we can backfill existing rows.
ALTER TABLE "agent_lead_documents" ADD COLUMN "agentId" TEXT;

-- 2. Backfill agentId from the document's current lead.
UPDATE "agent_lead_documents" d
SET "agentId" = l."agentId"
FROM "agent_leads" l
WHERE d."leadId" = l."id";

-- 3. Now that all existing rows are backfilled, make agentId required.
ALTER TABLE "agent_lead_documents" ALTER COLUMN "agentId" SET NOT NULL;

-- 4. leadId becomes optional (staged documents have no lead yet).
ALTER TABLE "agent_lead_documents" ALTER COLUMN "leadId" DROP NOT NULL;

-- 5. Foreign key + index for the new agentId column.
ALTER TABLE "agent_lead_documents" ADD CONSTRAINT "agent_lead_documents_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "agent_lead_documents_agentId_idx" ON "agent_lead_documents"("agentId");
