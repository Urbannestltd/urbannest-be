/*
  Warnings:

  - The values [SINGLE] on the enum `InviteFrequency` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "InviteFrequency_new" AS ENUM ('ONE_OFF', 'WHOLE_DAY', 'RECURRING');
ALTER TABLE "public"."VisitorInvite" ALTER COLUMN "frequency" DROP DEFAULT;
ALTER TABLE "VisitorInvite" ALTER COLUMN "frequency" TYPE "InviteFrequency_new" USING ("frequency"::text::"InviteFrequency_new");
ALTER TYPE "InviteFrequency" RENAME TO "InviteFrequency_old";
ALTER TYPE "InviteFrequency_new" RENAME TO "InviteFrequency";
DROP TYPE "public"."InviteFrequency_old";
ALTER TABLE "VisitorInvite" ALTER COLUMN "frequency" SET DEFAULT 'ONE_OFF';
COMMIT;

-- AlterTable
ALTER TABLE "VisitorInvite" ALTER COLUMN "frequency" SET DEFAULT 'ONE_OFF';
