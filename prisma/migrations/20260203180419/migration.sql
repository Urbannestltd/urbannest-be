-- AlterTable
ALTER TABLE "VisitorInvite" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "VisitorGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitorInvite_groupId_idx" ON "VisitorInvite"("groupId");

-- AddForeignKey
ALTER TABLE "VisitorGroup" ADD CONSTRAINT "VisitorGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorGroup" ADD CONSTRAINT "VisitorGroup_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorInvite" ADD CONSTRAINT "VisitorInvite_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "VisitorGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
