BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE "Member" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "Member" ADD COLUMN "termsVersion" TEXT;

CREATE TABLE "EventReport" (
  "id" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "eventId" TEXT,
  "eventTitle" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EventReport_status_idx" ON "EventReport"("status");
CREATE INDEX "EventReport_eventId_idx" ON "EventReport"("eventId");
ALTER TABLE "EventReport" ADD CONSTRAINT "EventReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventReport" ADD CONSTRAINT "EventReport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventReport" ADD CONSTRAINT "EventReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
