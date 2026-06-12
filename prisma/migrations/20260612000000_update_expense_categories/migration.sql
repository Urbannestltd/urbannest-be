-- Convert any existing expense records using old categories to OTHER
-- before we swap the enum type.
-- Convert any existing expense records using old categories to OTHER
-- before we swap the enum type.
UPDATE "expenses"
SET category = 'OTHER'
WHERE category::text IN ('MAINTENANCE', 'UTILITIES', 'INSURANCE', 'LEGAL');

-- Create the new enum with the correct values
CREATE TYPE "ExpenseCategory_new" AS ENUM (
  'PARTS',
  'SUPPLIES',
  'LABOUR',
  'EQUIPMENT',
  'TRANSPORT_COSTS',
  'PERMITS',
  'OTHER'
);

-- Migrate the column to the new type
ALTER TABLE "expenses"
  ALTER COLUMN category DROP DEFAULT,
  ALTER COLUMN category TYPE "ExpenseCategory_new"
    USING category::text::"ExpenseCategory_new";

-- Drop the old enum and rename the new one
DROP TYPE "ExpenseCategory";
ALTER TYPE "ExpenseCategory_new" RENAME TO "ExpenseCategory";
