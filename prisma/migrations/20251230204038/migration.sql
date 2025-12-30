-- CreateTable
CREATE TABLE "user" (
    "userId" TEXT NOT NULL,
    "userFirstName" TEXT,
    "userLastName" TEXT,
    "userDisplayName" TEXT,
    "userPhone" TEXT,
    "userEmail" TEXT NOT NULL,
    "userPassword" TEXT,
    "userGoogleId" TEXT,
    "userRoleId" TEXT NOT NULL,
    "userStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "userCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "role" (
    "roleId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "roleDescription" TEXT,
    "roleStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "roleCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roleUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("roleId")
);

-- CreateTable
CREATE TABLE "privilege" (
    "privilegeId" TEXT NOT NULL,
    "privilegeName" TEXT NOT NULL,
    "privilegeDescription" TEXT,
    "privilegeStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "privilegeCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "privilegeUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "privilege_pkey" PRIMARY KEY ("privilegeId")
);

-- CreateTable
CREATE TABLE "otpLogs" (
    "otpLogId" TEXT NOT NULL,
    "otpLogHash" TEXT NOT NULL,
    "otpLogUserId" TEXT NOT NULL,
    "otpLogStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "otpLogExpiry" TIMESTAMP(3) NOT NULL,
    "otpLogCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "otpLogUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "otpLogs_pkey" PRIMARY KEY ("otpLogId")
);

-- CreateTable
CREATE TABLE "passwordReset" (
    "passwordResetId" TEXT NOT NULL,
    "passwordResetToken" TEXT NOT NULL,
    "passwordResetExpiresAt" TIMESTAMP(3) NOT NULL,
    "passwordResetUserId" TEXT NOT NULL,
    "passwordResetUsed" BOOLEAN NOT NULL DEFAULT false,
    "passwordResetIpAddress" TEXT,
    "passwordResetCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passwordResetUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passwordReset_pkey" PRIMARY KEY ("passwordResetId")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_userEmail_key" ON "user"("userEmail");

-- CreateIndex
CREATE UNIQUE INDEX "user_userGoogleId_key" ON "user"("userGoogleId");

-- CreateIndex
CREATE UNIQUE INDEX "role_roleName_key" ON "role"("roleName");

-- CreateIndex
CREATE UNIQUE INDEX "privilege_privilegeName_key" ON "privilege"("privilegeName");

-- CreateIndex
CREATE UNIQUE INDEX "passwordReset_passwordResetToken_key" ON "passwordReset"("passwordResetToken");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_userRoleId_fkey" FOREIGN KEY ("userRoleId") REFERENCES "role"("roleId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otpLogs" ADD CONSTRAINT "otpLogs_otpLogUserId_fkey" FOREIGN KEY ("otpLogUserId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passwordReset" ADD CONSTRAINT "passwordReset_passwordResetUserId_fkey" FOREIGN KEY ("passwordResetUserId") REFERENCES "user"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
