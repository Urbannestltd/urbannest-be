-- AlterTable
ALTER TABLE "NotificationSetting" ADD COLUMN     "fmEmailAdminNote" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fmEmailAgentReschedule" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fmEmailBudgetResponse" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fmEmailNewAgentVisit" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fmEmailNewTicket" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fmEmailTenantMessage" BOOLEAN NOT NULL DEFAULT true;
