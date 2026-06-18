-- Ensure all ExpenseCategory enum values exist in the database.
-- This is a safety backfill in case the previous migration
-- (20260612000000_update_expense_categories) was applied before
-- EQUIPMENT and the other new categories were included in the file.
-- IF NOT EXISTS prevents errors when the value already exists.

ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'PARTS';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'SUPPLIES';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'LABOUR';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'EQUIPMENT';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'TRANSPORT_COSTS';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'PERMITS';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'OTHER';
