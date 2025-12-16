BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[user] (
    [userId] NVARCHAR(1000) NOT NULL,
    [userEmail] NVARCHAR(1000) NOT NULL,
    [userPassword] NVARCHAR(1000) NOT NULL,
    [userRoleId] NVARCHAR(1000) NOT NULL,
    [userStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [user_userStatus_df] DEFAULT 'ACTIVE',
    [userCreatedAt] DATETIME2 NOT NULL CONSTRAINT [user_userCreatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [userUpdatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [user_pkey] PRIMARY KEY CLUSTERED ([userId]),
    CONSTRAINT [user_userEmail_key] UNIQUE NONCLUSTERED ([userEmail])
);

-- CreateTable
CREATE TABLE [dbo].[Role] (
    [roleId] NVARCHAR(1000) NOT NULL,
    [roleName] NVARCHAR(1000) NOT NULL,
    [roleDescription] NVARCHAR(1000),
    [roleStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [Role_roleStatus_df] DEFAULT 'ACTIVE',
    [roleCreatedAt] DATETIME2 NOT NULL CONSTRAINT [Role_roleCreatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [roleUpdatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Role_pkey] PRIMARY KEY CLUSTERED ([roleId]),
    CONSTRAINT [Role_roleName_key] UNIQUE NONCLUSTERED ([roleName])
);

-- CreateTable
CREATE TABLE [dbo].[Privilege] (
    [privilegeId] NVARCHAR(1000) NOT NULL,
    [privilegeName] NVARCHAR(1000) NOT NULL,
    [privilegeDescription] NVARCHAR(1000),
    [privilegeStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [Privilege_privilegeStatus_df] DEFAULT 'ACTIVE',
    [privilegeCreatedAt] DATETIME2 NOT NULL CONSTRAINT [Privilege_privilegeCreatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [privilegeUpdatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Privilege_pkey] PRIMARY KEY CLUSTERED ([privilegeId]),
    CONSTRAINT [Privilege_privilegeName_key] UNIQUE NONCLUSTERED ([privilegeName])
);

-- AddForeignKey
ALTER TABLE [dbo].[user] ADD CONSTRAINT [user_userRoleId_fkey] FOREIGN KEY ([userRoleId]) REFERENCES [dbo].[Role]([roleId]) ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
