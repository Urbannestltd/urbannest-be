-- Add EXPIRED_NO_SHOW to InviteStatus enum
ALTER TYPE "InviteStatus" ADD VALUE IF NOT EXISTS 'EXPIRED_NO_SHOW';

-- Add departure verification columns to VisitorInvite
ALTER TABLE "VisitorInvite"
  ADD COLUMN IF NOT EXISTS "departureToken" TEXT,
  ADD COLUMN IF NOT EXISTS "departureRequestAt" TIMESTAMP(3);

-- Unique constraint on departureToken
ALTER TABLE "VisitorInvite"
  ADD CONSTRAINT "VisitorInvite_departureToken_key" UNIQUE ("departureToken");
