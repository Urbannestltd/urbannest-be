-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('LOGGED', 'FLAGGED', 'PENDING_APPROVAL', 'REJECTED', 'REBUTTED');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "flagReason" TEXT,
ADD COLUMN     "loggedById" TEXT,
ADD COLUMN     "status" "ExpenseStatus" NOT NULL DEFAULT 'LOGGED';

-- CreateTable
CREATE TABLE "budget_adjustments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "expenseId" TEXT,
    "oldBudget" DOUBLE PRECISION NOT NULL,
    "newBudget" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "adjustedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_adjustments_ticketId_idx" ON "budget_adjustments"("ticketId");

-- CreateIndex
CREATE INDEX "expenses_status_idx" ON "expenses"("status");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "user"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_adjustments" ADD CONSTRAINT "budget_adjustments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "MaintenanceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_adjustments" ADD CONSTRAINT "budget_adjustments_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_adjustments" ADD CONSTRAINT "budget_adjustments_adjustedById_fkey" FOREIGN KEY ("adjustedById") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
