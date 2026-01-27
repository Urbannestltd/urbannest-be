/*
  Warnings:

  - You are about to drop the column `qrCodeUrl` on the `VisitorInvite` table. All the data in the column will be lost.
  - The `type` column on the `VisitorInvite` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "VisitorType" AS ENUM ('GUEST', 'DELIVERY', 'SERVICE_PROVIDER');

-- CreateEnum
CREATE TYPE "InviteFrequency" AS ENUM ('SINGLE', 'RECURRING');

-- AlterTable
ALTER TABLE "VisitorInvite" DROP COLUMN "qrCodeUrl",
ADD COLUMN     "frequency" "InviteFrequency" NOT NULL DEFAULT 'SINGLE',
DROP COLUMN "type",
ADD COLUMN     "type" "VisitorType" NOT NULL DEFAULT 'GUEST';

-- DropEnum
DROP TYPE "InviteType";
