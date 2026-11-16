ALTER TABLE "Meetup" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "PhaseNotice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipientId" TEXT NOT NULL REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "actorId" TEXT NOT NULL REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "meetupId" TEXT REFERENCES "Meetup"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "needId" TEXT REFERENCES "ResourceNeed"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "sourceKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "message" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL,
    "pushQueuedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    CHECK (("kind" = 'COOPERATION_INVITE' AND "needId" IS NOT NULL AND "meetupId" IS NULL AND "sourceKey" = "needId") OR
           ("kind" IN ('MEETUP_CHANGED', 'MEETUP_REMINDER', 'MEETUP_CANCELLED') AND "meetupId" IS NOT NULL AND "needId" IS NULL AND "sourceKey" = "meetupId"))
);
CREATE UNIQUE INDEX "PhaseNotice_recipientId_kind_sourceKey_revision_key" ON "PhaseNotice"("recipientId", "kind", "sourceKey", "revision");
CREATE INDEX "PhaseNotice_recipientId_availableAt_idx" ON "PhaseNotice"("recipientId", "availableAt");
CREATE INDEX "PhaseNotice_pushQueuedAt_availableAt_idx" ON "PhaseNotice"("pushQueuedAt", "availableAt");
CREATE INDEX "PhaseNotice_meetupId_idx" ON "PhaseNotice"("meetupId");
CREATE INDEX "PhaseNotice_needId_idx" ON "PhaseNotice"("needId");

INSERT INTO "PhaseNotice" ("id", "recipientId", "actorId", "meetupId", "sourceKey", "kind", "revision", "availableAt")
SELECT 'reminder-' || md5(r."meetupId" || ':' || r."memberId"), r."memberId", m."hostId", m."id", m."id",
       'MEETUP_REMINDER', m."revision", GREATEST(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', m."startsAt" - INTERVAL '24 hours')
FROM "MeetupRegistration" r JOIN "Meetup" m ON m."id" = r."meetupId"
WHERE r."memberId" <> m."hostId" AND m."cancelledAt" IS NULL AND m."startsAt" > CURRENT_TIMESTAMP AT TIME ZONE 'UTC';

ALTER TABLE "MobilePushReceipt" DROP CONSTRAINT "MobilePushReceipt_kind_check",
ADD CONSTRAINT "MobilePushReceipt_kind_check" CHECK ("kind" IN ('activity', 'friend_invitation', 'experience_review', 'membership_review', 'next_phase'));
