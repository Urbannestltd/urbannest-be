/*
  Warnings:

  - You are about to drop the `Privilege` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Role` table. If the table is not empty, all the data it contains will be lost.

*/
BEGIN TRY

BEGIN TRAN;

-- DropForeignKey
ALTER TABLE [dbo].[user] DROP CONSTRAINT [user_userRoleId_fkey];

-- DropTable
DROP TABLE [dbo].[Privilege];

-- DropTable
DROP TABLE [dbo].[Role];

-- CreateTable
CREATE TABLE [dbo].[role] (
    [roleId] NVARCHAR(1000) NOT NULL,
    [roleName] NVARCHAR(1000) NOT NULL,
    [roleDescription] NVARCHAR(1000),
    [roleStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [role_roleStatus_df] DEFAULT 'ACTIVE',
    [roleCreatedAt] DATETIME2 NOT NULL CONSTRAINT [role_roleCreatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [roleUpdatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [role_pkey] PRIMARY KEY CLUSTERED ([roleId]),
    CONSTRAINT [role_roleName_key] UNIQUE NONCLUSTERED ([roleName])
);

-- CreateTable
CREATE TABLE [dbo].[privilege] (
    [privilegeId] NVARCHAR(1000) NOT NULL,
    [privilegeName] NVARCHAR(1000) NOT NULL,
    [privilegeDescription] NVARCHAR(1000),
    [privilegeStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [privilege_privilegeStatus_df] DEFAULT 'ACTIVE',
    [privilegeCreatedAt] DATETIME2 NOT NULL CONSTRAINT [privilege_privilegeCreatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [privilegeUpdatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [privilege_pkey] PRIMARY KEY CLUSTERED ([privilegeId]),
    CONSTRAINT [privilege_privilegeName_key] UNIQUE NONCLUSTERED ([privilegeName])
);

-- AddForeignKey
ALTER TABLE [dbo].[user] ADD CONSTRAINT [user_userRoleId_fkey] FOREIGN KEY ([userRoleId]) REFERENCES [dbo].[role]([roleId]) ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
