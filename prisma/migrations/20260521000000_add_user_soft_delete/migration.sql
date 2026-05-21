-- AlterTable
ALTER TABLE "user" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false,
                   ADD COLUMN "deletedAt" TIMESTAMP(3);
