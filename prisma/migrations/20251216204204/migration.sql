/*
  Warnings:

  - A unique constraint covering the columns `[userGoogleId]` on the table `user` will be added. If there are existing duplicate values, this will fail.

*/
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[user] ALTER COLUMN [userPassword] NVARCHAR(1000) NULL;
ALTER TABLE [dbo].[user] ADD [userGoogleId] NVARCHAR(1000);

-- CreateIndex
ALTER TABLE [dbo].[user] ADD CONSTRAINT [user_userGoogleId_key] UNIQUE NONCLUSTERED ([userGoogleId]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
