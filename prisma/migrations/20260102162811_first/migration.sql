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

-- CreateIndex
CREATE UNIQUE INDEX "userRegistrationLink_userRegistrationLinkToken_key" ON "userRegistrationLink"("userRegistrationLinkToken");

-- AddForeignKey
ALTER TABLE "userRegistrationLink" ADD CONSTRAINT "userRegistrationLink_userRegistrationLinkUserId_fkey" FOREIGN KEY ("userRegistrationLinkUserId") REFERENCES "user"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
