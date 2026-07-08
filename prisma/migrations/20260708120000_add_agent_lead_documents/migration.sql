-- CreateEnum
CREATE TYPE "AgentLeadDocumentCategory" AS ENUM ('ID', 'PROOF_OF_INCOME', 'PROOF_OF_ADDRESS');

-- CreateEnum
CREATE TYPE "AgentLeadDocumentType" AS ENUM ('PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENSE', 'VOTERS_CARD', 'BANK_STATEMENT', 'EMPLOYMENT_LETTER', 'PAYSLIP', 'PROOF_OF_BUSINESS', 'UTILITY_BILL');

-- AlterTable
ALTER TABLE "agent_leads" DROP COLUMN "documents",
ADD COLUMN     "annualIncome" DOUBLE PRECISION,
ADD COLUMN     "employmentDuration" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "agent_lead_documents" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "category" "AgentLeadDocumentCategory" NOT NULL,
    "type" "AgentLeadDocumentType" NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_lead_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_lead_documents_leadId_idx" ON "agent_lead_documents"("leadId");

-- AddForeignKey
ALTER TABLE "agent_lead_documents" ADD CONSTRAINT "agent_lead_documents_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "agent_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
