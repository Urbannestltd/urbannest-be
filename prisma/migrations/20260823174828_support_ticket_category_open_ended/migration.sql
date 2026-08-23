-- AlterTable: convert category from the SupportCategory enum to a plain
-- string, preserving existing values (e.g. "BILLING" stays "BILLING").
ALTER TABLE "SupportTicket" ALTER COLUMN "category" TYPE TEXT USING "category"::text;

-- DropEnum
DROP TYPE "SupportCategory";
