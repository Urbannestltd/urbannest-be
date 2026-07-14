-- CreateTable
CREATE TABLE "agent_lead_referees" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "relationship" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_lead_referees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_lead_referees_leadId_idx" ON "agent_lead_referees"("leadId");

-- AddForeignKey
ALTER TABLE "agent_lead_referees" ADD CONSTRAINT "agent_lead_referees_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "agent_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
