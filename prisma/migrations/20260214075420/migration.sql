-- AlterTable
ALTER TABLE "user" ADD COLUMN     "isTwoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorExpiry" TIMESTAMP(3),
ADD COLUMN     "twoFactorSecret" TEXT;
