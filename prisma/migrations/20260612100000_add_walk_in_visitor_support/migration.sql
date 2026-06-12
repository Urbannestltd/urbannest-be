-- Add PENDING and REJECTED to InviteStatus enum
ALTER TYPE "InviteStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "InviteStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- Add walk-in approval workflow columns to VisitorInvite
ALTER TABLE "VisitorInvite"
  ADD COLUMN IF NOT EXISTS "registeredByFmId" TEXT,
  ADD COLUMN IF NOT EXISTS "approvalToken" TEXT,
  ADD COLUMN IF NOT EXISTS "approvalExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fallbackRule" TEXT;

-- Unique constraint on approvalToken
ALTER TABLE "VisitorInvite"
  ADD CONSTRAINT "VisitorInvite_approvalToken_key" UNIQUE ("approvalToken");

-- Foreign key from registeredByFmId to user
ALTER TABLE "VisitorInvite"
  ADD CONSTRAINT "VisitorInvite_registeredByFmId_fkey"
  FOREIGN KEY ("registeredByFmId") REFERENCES "user"("userId")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS "VisitorInvite_registeredByFmId_idx" ON "VisitorInvite"("registeredByFmId");
CREATE INDEX IF NOT EXISTS "VisitorInvite_approvalToken_idx" ON "VisitorInvite"("approvalToken");
