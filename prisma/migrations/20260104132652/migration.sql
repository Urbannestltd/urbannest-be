/*
  Warnings:

  - You are about to drop the column `userDisplayName` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `userLastName` on the `user` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "user" DROP COLUMN "userDisplayName",
DROP COLUMN "userLastName",
ADD COLUMN     "userFullName" TEXT,
ALTER COLUMN "userStatus" SET DEFAULT 'PENDING';
