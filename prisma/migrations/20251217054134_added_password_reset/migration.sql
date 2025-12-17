BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[passwordReset] (
    [passwordResetId] NVARCHAR(1000) NOT NULL,
    [passwordResetToken] NVARCHAR(1000) NOT NULL,
    [passwordResetExpiresAt] DATETIME2 NOT NULL,
    [passwordResetUserId] NVARCHAR(1000) NOT NULL,
    [passwordResetUsed] BIT NOT NULL CONSTRAINT [passwordReset_passwordResetUsed_df] DEFAULT 0,
    [passwordResetIpAddress] NVARCHAR(1000),
    [passwordResetCreatedAt] DATETIME2 NOT NULL CONSTRAINT [passwordReset_passwordResetCreatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [passwordResetUpdatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [passwordReset_pkey] PRIMARY KEY CLUSTERED ([passwordResetId]),
    CONSTRAINT [passwordReset_passwordResetToken_key] UNIQUE NONCLUSTERED ([passwordResetToken])
);

-- AddForeignKey
ALTER TABLE [dbo].[passwordReset] ADD CONSTRAINT [passwordReset_passwordResetUserId_fkey] FOREIGN KEY ([passwordResetUserId]) REFERENCES [dbo].[user]([userId]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
