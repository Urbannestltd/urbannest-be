-- CreateEnum
CREATE TYPE "InviteType" AS ENUM ('SINGLE_ENTRY', 'RECURRING');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'COMPLETED');

-- CreateTable
CREATE TABLE "VisitorInvite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "visitorName" TEXT NOT NULL,
    "visitorPhone" TEXT,
    "accessCode" TEXT NOT NULL,
    "qrCodeUrl" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "type" "InviteType" NOT NULL DEFAULT 'SINGLE_ENTRY',
    "status" "InviteStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedInAt" TIMESTAMP(3),

    CONSTRAINT "VisitorInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VisitorInvite_accessCode_key" ON "VisitorInvite"("accessCode");

-- CreateIndex
CREATE INDEX "VisitorInvite_accessCode_idx" ON "VisitorInvite"("accessCode");

-- AddForeignKey
ALTER TABLE "VisitorInvite" ADD CONSTRAINT "VisitorInvite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorInvite" ADD CONSTRAINT "VisitorInvite_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;
