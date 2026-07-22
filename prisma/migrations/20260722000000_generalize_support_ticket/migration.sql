-- Generalize SupportTicket to be application-wide (not tenant-only), and
-- add fields for the 1-click "resolve via email link" flow.

-- Drop the old FK/index tied to tenantId, rename the column, then recreate
-- the FK/index under the new name so existing rows are preserved.
ALTER TABLE "SupportTicket" DROP CONSTRAINT "SupportTicket_tenantId_fkey";
DROP INDEX "SupportTicket_tenantId_idx";

ALTER TABLE "SupportTicket" RENAME COLUMN "tenantId" TO "userId";

CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "SupportTicket"
  ADD COLUMN "resolutionToken" TEXT,
  ADD COLUMN "resolutionExpiresAt" TIMESTAMP(3),
  ADD COLUMN "resolvedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "SupportTicket_resolutionToken_key" ON "SupportTicket"("resolutionToken");
