-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('ADMIN', 'LANDLORD', 'TENANT', 'VENDOR');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('MULTI_UNIT', 'SINGLE_FAMILY', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('RENT', 'UTILITY_BILL', 'UTILITY_TOKEN', 'SERVICE_CHARGE');

-- CreateEnum
CREATE TYPE "UtilityType" AS ENUM ('ELECTRICITY', 'WATER', 'SERVICE_CHARGE', 'WASTE', 'INTERNET');

-- CreateEnum
CREATE TYPE "VisitorType" AS ENUM ('GUEST', 'DELIVERY', 'SERVICE_PROVIDER');

-- CreateEnum
CREATE TYPE "InviteFrequency" AS ENUM ('ONE_OFF', 'WHOLE_DAY', 'RECURRING');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'COMPLETED', 'UPCOMING', 'CHECKED_IN', 'CHECKED_OUT');

-- CreateEnum
CREATE TYPE "SupportCategory" AS ENUM ('BILLING', 'ACCOUNT_ISSUE', 'APP_BUG', 'DISPUTE', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "MaintenanceCategory" AS ENUM ('PLUMBING', 'ELECTRICAL', 'HVAC', 'APPLIANCE', 'STRUCTURAL', 'PEST_CONTROL', 'OTHER');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "user" (
    "userId" TEXT NOT NULL,
    "userFirstName" TEXT,
    "userFullName" TEXT,
    "userPhone" TEXT,
    "userEmail" TEXT NOT NULL,
    "userPassword" TEXT,
    "userGoogleId" TEXT,
    "userRoleId" TEXT NOT NULL,
    "userStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "userCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userUpdatedAt" TIMESTAMP(3) NOT NULL,
    "userProfileUrl" TEXT,
    "userEmergencyContact" TEXT,
    "isTwoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "twoFactorExpiry" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isValid" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "userRegistrationLink" (
    "userRegistrationLinkId" TEXT NOT NULL,
    "userRegistrationLinkToken" TEXT NOT NULL,
    "userRegistrationLinkExpiresAt" TIMESTAMP(3) NOT NULL,
    "userRegistrationLinkUserId" TEXT NOT NULL,
    "userRegistrationLinkUsed" BOOLEAN NOT NULL DEFAULT false,
    "userRegistrationLinkIpAddress" TEXT,
    "userRegistrationLinkCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userRegistrationLinkUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "userRegistrationLink_pkey" PRIMARY KEY ("userRegistrationLinkId")
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

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "type" "PropertyType" NOT NULL DEFAULT 'MULTI_UNIT',
    "landlordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floor" TEXT,
    "baseRent" DOUBLE PRECISION,
    "bedrooms" INTEGER NOT NULL DEFAULT 1,
    "bathrooms" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "status" "UnitStatus" NOT NULL DEFAULT 'AVAILABLE',
    "propertyId" TEXT NOT NULL,
    "landlordId" TEXT,
    "facilityManagerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leases" (
    "id" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "rentAmount" DOUBLE PRECISION NOT NULL,
    "status" "LeaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "documentUrl" TEXT,
    "unitId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utility_profiles" (
    "id" TEXT NOT NULL,
    "type" "UtilityType" NOT NULL,
    "provider" TEXT,
    "identifier" TEXT NOT NULL,
    "label" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utility_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utility_bills" (
    "id" TEXT NOT NULL,
    "type" "UtilityType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "leaseId" TEXT NOT NULL,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utility_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3),
    "paidDate" TIMESTAMP(3),
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL DEFAULT 'RENT',
    "utilityType" "UtilityType",
    "utilityToken" TEXT,
    "meterNo" TEXT,
    "metadata" JSONB,
    "userId" TEXT NOT NULL,
    "leaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorizationCode" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "cardType" TEXT NOT NULL,
    "bank" TEXT,
    "expMonth" TEXT NOT NULL,
    "expYear" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorInvite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "groupId" TEXT,
    "visitorName" TEXT NOT NULL,
    "visitorPhone" TEXT,
    "accessCode" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "type" "VisitorType" NOT NULL DEFAULT 'GUEST',
    "frequency" "InviteFrequency" NOT NULL DEFAULT 'ONE_OFF',
    "status" "InviteStatus" NOT NULL DEFAULT 'ACTIVE',
    "isWalkIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),

    CONSTRAINT "VisitorInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" "SupportCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "SupportStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "SupportPriority" NOT NULL DEFAULT 'LOW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "attachments" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "category" "MaintenanceCategory" NOT NULL,
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'PENDING',
    "subject" TEXT,
    "description" TEXT NOT NULL,
    "attachments" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assignedToId" TEXT,

    CONSTRAINT "MaintenanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "attachments" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "MaintenanceMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailPayments" BOOLEAN NOT NULL DEFAULT true,
    "emailLease" BOOLEAN NOT NULL DEFAULT true,
    "emailMaintenance" BOOLEAN NOT NULL DEFAULT true,
    "emailVisitors" BOOLEAN NOT NULL DEFAULT true,
    "pushPayments" BOOLEAN NOT NULL DEFAULT false,
    "pushMaintenance" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "isSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_userEmail_key" ON "user"("userEmail");

-- CreateIndex
CREATE UNIQUE INDEX "user_userGoogleId_key" ON "user"("userGoogleId");

-- CreateIndex
CREATE INDEX "user_userRoleId_idx" ON "user"("userRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshToken_key" ON "Session"("refreshToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "role_roleName_key" ON "role"("roleName");

-- CreateIndex
CREATE UNIQUE INDEX "privilege_privilegeName_key" ON "privilege"("privilegeName");

-- CreateIndex
CREATE INDEX "otpLogs_otpLogUserId_idx" ON "otpLogs"("otpLogUserId");

-- CreateIndex
CREATE UNIQUE INDEX "userRegistrationLink_userRegistrationLinkToken_key" ON "userRegistrationLink"("userRegistrationLinkToken");

-- CreateIndex
CREATE INDEX "userRegistrationLink_userRegistrationLinkUserId_idx" ON "userRegistrationLink"("userRegistrationLinkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "passwordReset_passwordResetToken_key" ON "passwordReset"("passwordResetToken");

-- CreateIndex
CREATE INDEX "passwordReset_passwordResetUserId_idx" ON "passwordReset"("passwordResetUserId");

-- CreateIndex
CREATE INDEX "properties_landlordId_idx" ON "properties"("landlordId");

-- CreateIndex
CREATE INDEX "units_propertyId_idx" ON "units"("propertyId");

-- CreateIndex
CREATE INDEX "units_landlordId_idx" ON "units"("landlordId");

-- CreateIndex
CREATE INDEX "units_facilityManagerId_idx" ON "units"("facilityManagerId");

-- CreateIndex
CREATE INDEX "leases_unitId_idx" ON "leases"("unitId");

-- CreateIndex
CREATE INDEX "leases_tenantId_idx" ON "leases"("tenantId");

-- CreateIndex
CREATE INDEX "utility_profiles_userId_idx" ON "utility_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "utility_bills_paymentId_key" ON "utility_bills"("paymentId");

-- CreateIndex
CREATE INDEX "utility_bills_leaseId_idx" ON "utility_bills"("leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

-- CreateIndex
CREATE INDEX "payments_userId_idx" ON "payments"("userId");

-- CreateIndex
CREATE INDEX "payments_leaseId_idx" ON "payments"("leaseId");

-- CreateIndex
CREATE INDEX "PaymentMethod_userId_idx" ON "PaymentMethod"("userId");

-- CreateIndex
CREATE INDEX "VisitorGroup_tenantId_idx" ON "VisitorGroup"("tenantId");

-- CreateIndex
CREATE INDEX "VisitorGroup_unitId_idx" ON "VisitorGroup"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitorInvite_accessCode_key" ON "VisitorInvite"("accessCode");

-- CreateIndex
CREATE INDEX "VisitorInvite_accessCode_idx" ON "VisitorInvite"("accessCode");

-- CreateIndex
CREATE INDEX "VisitorInvite_groupId_idx" ON "VisitorInvite"("groupId");

-- CreateIndex
CREATE INDEX "VisitorInvite_tenantId_idx" ON "VisitorInvite"("tenantId");

-- CreateIndex
CREATE INDEX "VisitorInvite_unitId_idx" ON "VisitorInvite"("unitId");

-- CreateIndex
CREATE INDEX "SupportTicket_tenantId_idx" ON "SupportTicket"("tenantId");

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_idx" ON "SupportMessage"("ticketId");

-- CreateIndex
CREATE INDEX "SupportMessage_senderId_idx" ON "SupportMessage"("senderId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_unitId_idx" ON "MaintenanceRequest"("unitId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_tenantId_idx" ON "MaintenanceRequest"("tenantId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_assignedToId_idx" ON "MaintenanceRequest"("assignedToId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_status_idx" ON "MaintenanceRequest"("status");

-- CreateIndex
CREATE INDEX "MaintenanceMessage_ticketId_idx" ON "MaintenanceMessage"("ticketId");

-- CreateIndex
CREATE INDEX "MaintenanceMessage_senderId_idx" ON "MaintenanceMessage"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSetting_userId_key" ON "NotificationSetting"("userId");

-- CreateIndex
CREATE INDEX "Reminder_userId_idx" ON "Reminder"("userId");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_userRoleId_fkey" FOREIGN KEY ("userRoleId") REFERENCES "role"("roleId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otpLogs" ADD CONSTRAINT "otpLogs_otpLogUserId_fkey" FOREIGN KEY ("otpLogUserId") REFERENCES "user"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userRegistrationLink" ADD CONSTRAINT "userRegistrationLink_userRegistrationLinkUserId_fkey" FOREIGN KEY ("userRegistrationLinkUserId") REFERENCES "user"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passwordReset" ADD CONSTRAINT "passwordReset_passwordResetUserId_fkey" FOREIGN KEY ("passwordResetUserId") REFERENCES "user"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "user"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_facilityManagerId_fkey" FOREIGN KEY ("facilityManagerId") REFERENCES "user"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leases" ADD CONSTRAINT "leases_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leases" ADD CONSTRAINT "leases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_profiles" ADD CONSTRAINT "utility_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_bills" ADD CONSTRAINT "utility_bills_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_bills" ADD CONSTRAINT "utility_bills_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorGroup" ADD CONSTRAINT "VisitorGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorGroup" ADD CONSTRAINT "VisitorGroup_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorInvite" ADD CONSTRAINT "VisitorInvite_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "VisitorGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorInvite" ADD CONSTRAINT "VisitorInvite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorInvite" ADD CONSTRAINT "VisitorInvite_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "user"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceMessage" ADD CONSTRAINT "MaintenanceMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "MaintenanceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceMessage" ADD CONSTRAINT "MaintenanceMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
