-- Additive security/history migration. Never reset/seed production.
-- Keep FK replacement/token invalidation atomic and bound lock waits/work time.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- Version 1 deliberately invalidates JWTs created before session versioning.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Member" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Bind all newly issued verification links to an address. Existing pending links
-- cannot prove which address was verified, so expire them rather than trust a backfill.
-- A fail-closed empty sentinel lets a still-running legacy writer omit email
-- during rollout. New consumers reject empty addresses and require re-issuance.
ALTER TABLE "EmailVerificationToken" ADD COLUMN "email" TEXT DEFAULT '';
UPDATE "EmailVerificationToken" AS t
SET "email" = lower(btrim(u."email")), "usedAt" = COALESCE(t."usedAt", CURRENT_TIMESTAMP)
FROM "User" AS u WHERE u."id" = t."userId";
ALTER TABLE "EmailVerificationToken" ALTER COLUMN "email" SET NOT NULL;

ALTER TABLE "PasswordResetToken" ADD COLUMN "email" TEXT DEFAULT '';
UPDATE "PasswordResetToken" AS t
SET "email" = lower(btrim(u."email")), "usedAt" = COALESCE(t."usedAt", CURRENT_TIMESTAMP)
FROM "User" AS u WHERE u."id" = t."userId";
ALTER TABLE "PasswordResetToken" ALTER COLUMN "email" SET NOT NULL;

-- Defensive FKs: deleting a person must never delete shared authored history.
ALTER TABLE "Event" DROP CONSTRAINT "Event_createdById_fkey";
ALTER TABLE "Event" ADD CONSTRAINT "Event_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventNotification" DROP CONSTRAINT "EventNotification_senderId_fkey";
ALTER TABLE "EventNotification" ADD CONSTRAINT "EventNotification_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AccountDeletionCleanup" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "avatarPrefix" TEXT NOT NULL,
  "bucket" TEXT,
  "region" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "processingStartedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountDeletionCleanup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountDeletionCleanup_memberId_key" ON "AccountDeletionCleanup"("memberId");
CREATE INDEX "AccountDeletionCleanup_status_createdAt_idx" ON "AccountDeletionCleanup"("status", "createdAt");
ALTER TABLE "AccountDeletionCleanup" ADD CONSTRAINT "AccountDeletionCleanup_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "EventCheckInAudit" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "reason" TEXT,
  "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventCheckInAudit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventCheckInAudit_registrationId_key" ON "EventCheckInAudit"("registrationId");
CREATE INDEX "EventCheckInAudit_eventId_checkedInAt_idx" ON "EventCheckInAudit"("eventId", "checkedInAt");
ALTER TABLE "EventCheckInAudit" ADD CONSTRAINT "EventCheckInAudit_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventCheckInAudit" ADD CONSTRAINT "EventCheckInAudit_registrationId_fkey"
  FOREIGN KEY ("registrationId") REFERENCES "EventRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventCheckInAudit" ADD CONSTRAINT "EventCheckInAudit_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventCheckInAudit" ADD CONSTRAINT "EventCheckInAudit_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "RateLimitAttempt_windowStart_idx" ON "RateLimitAttempt"("windowStart");
CREATE INDEX "EventRegistration_eventId_status_idx" ON "EventRegistration"("eventId", "status");

-- Existing checkedInAt/checkedInById values are retained. Do not invent missing
-- historical operators; the new audit table records check-ins made after this release.
-- Membership dates need their actual month to resolve the July 1 Lions year.
-- Legacy month-precision records did not store a month: leave them unknown.
ALTER TABLE "MemberExperience" ADD COLUMN "startMonth" INTEGER;
ALTER TABLE "MemberExperience" ADD CONSTRAINT "MemberExperience_startMonth_check" CHECK ("startMonth" IS NULL OR "startMonth" BETWEEN 1 AND 12);

COMMIT;
