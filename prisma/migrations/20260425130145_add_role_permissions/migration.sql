-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Permission" ADD VALUE 'MANAGE_TICKETS';
ALTER TYPE "Permission" ADD VALUE 'APPROVE_MINOR_MAINTENANCE';
ALTER TYPE "Permission" ADD VALUE 'ACCESS_TENANT_PORTAL';
ALTER TYPE "Permission" ADD VALUE 'PAY_RENT_ONLINE';
ALTER TYPE "Permission" ADD VALUE 'REQUEST_MAINTENANCE';
ALTER TYPE "Permission" ADD VALUE 'VISITOR_ALLOWANCE';
