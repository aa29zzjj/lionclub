-- Additive, opt-in foundation only. Do not run automatically with an App build.
CREATE TABLE "MobilePushDevice" (
  "id" TEXT NOT NULL,
  "installationId" UUID NOT NULL,
  "revision" BIGINT NOT NULL,
  "bindingVersion" INTEGER NOT NULL DEFAULT 1,
  "userId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "sessionVersion" INTEGER NOT NULL,
  "environment" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "tokenHash" CHAR(64),
  "tokenCiphertext" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MobilePushDevice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MobilePushDevice_revision_check" CHECK ("revision" BETWEEN 1 AND 9007199254740991 AND "bindingVersion" > 0 AND "sessionVersion" >= 0),
  CONSTRAINT "MobilePushDevice_environment_check" CHECK ("environment" IN ('sandbox', 'production') AND "topic" = 'com.lionclubsmembership.app'),
  CONSTRAINT "MobilePushDevice_lease_check" CHECK (NOT "enabled" OR ("tokenHash" IS NOT NULL AND "tokenCiphertext" IS NOT NULL AND "leaseExpiresAt" > "lastSeenAt" AND "leaseExpiresAt" <= "lastSeenAt" + INTERVAL '24 hours'))
);

CREATE TABLE "MobilePushReceipt" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceRevision" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "readAt" TIMESTAMP(3),
  CONSTRAINT "MobilePushReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MobilePushReceipt_kind_check" CHECK ("kind" IN ('activity', 'friend_invitation', 'experience_review', 'membership_review')),
  CONSTRAINT "MobilePushReceipt_expiry_check" CHECK ("expiresAt" > "createdAt")
);

CREATE TABLE "MobilePushDelivery" (
  "id" TEXT NOT NULL,
  "apnsId" UUID NOT NULL,
  "receiptId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "bindingVersion" INTEGER NOT NULL,
  "sessionVersion" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lockId" UUID,
  "lockedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MobilePushDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MobilePushDelivery_status_check" CHECK ("status" IN ('PENDING', 'SENDING', 'RETRY', 'ACCEPTED', 'DISCARDED')),
  CONSTRAINT "MobilePushDelivery_attempt_check" CHECK ("attemptCount" BETWEEN 0 AND 5 AND "bindingVersion" > 0 AND "sessionVersion" >= 0)
);

CREATE UNIQUE INDEX "MobilePushDevice_installationId_key" ON "MobilePushDevice"("installationId");
CREATE UNIQUE INDEX "MobilePushDevice_environment_topic_tokenHash_key" ON "MobilePushDevice"("environment", "topic", "tokenHash");
CREATE INDEX "MobilePushDevice_memberId_enabled_leaseExpiresAt_idx" ON "MobilePushDevice"("memberId", "enabled", "leaseExpiresAt");
CREATE INDEX "MobilePushDevice_userId_enabled_leaseExpiresAt_idx" ON "MobilePushDevice"("userId", "enabled", "leaseExpiresAt");
CREATE UNIQUE INDEX "MobilePushReceipt_userId_kind_sourceId_sourceRevision_key" ON "MobilePushReceipt"("userId", "kind", "sourceId", "sourceRevision");
CREATE INDEX "MobilePushReceipt_memberId_createdAt_idx" ON "MobilePushReceipt"("memberId", "createdAt");
CREATE INDEX "MobilePushReceipt_expiresAt_idx" ON "MobilePushReceipt"("expiresAt");
CREATE UNIQUE INDEX "MobilePushDelivery_apnsId_key" ON "MobilePushDelivery"("apnsId");
CREATE UNIQUE INDEX "MobilePushDelivery_receiptId_deviceId_bindingVersion_key" ON "MobilePushDelivery"("receiptId", "deviceId", "bindingVersion");
CREATE INDEX "MobilePushDelivery_status_availableAt_idx" ON "MobilePushDelivery"("status", "availableAt");
CREATE INDEX "MobilePushDelivery_expiresAt_idx" ON "MobilePushDelivery"("expiresAt");

ALTER TABLE "MobilePushDevice" ADD CONSTRAINT "MobilePushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MobilePushDevice" ADD CONSTRAINT "MobilePushDevice_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MobilePushReceipt" ADD CONSTRAINT "MobilePushReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MobilePushReceipt" ADD CONSTRAINT "MobilePushReceipt_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MobilePushReceipt" ADD CONSTRAINT "MobilePushReceipt_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MobilePushDelivery" ADD CONSTRAINT "MobilePushDelivery_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "MobilePushReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MobilePushDelivery" ADD CONSTRAINT "MobilePushDelivery_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MobilePushDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
