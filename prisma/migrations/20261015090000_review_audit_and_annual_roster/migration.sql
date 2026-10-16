BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE "ExperienceReviewAudit" (
  "id" TEXT NOT NULL,
  "experienceId" TEXT,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "reviewRole" TEXT NOT NULL,
  "scopeId" TEXT,
  "reason" TEXT,
  "experienceUpdatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExperienceReviewAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExperienceReviewAudit_experienceId_createdAt_idx" ON "ExperienceReviewAudit"("experienceId", "createdAt");
CREATE INDEX "ExperienceReviewAudit_actorId_createdAt_idx" ON "ExperienceReviewAudit"("actorId", "createdAt");
ALTER TABLE "ExperienceReviewAudit" ADD CONSTRAINT "ExperienceReviewAudit_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "MemberExperience"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExperienceReviewAudit" ADD CONSTRAINT "ExperienceReviewAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RosterImportBatch" (
  "id" TEXT NOT NULL,
  "sourceDigest" TEXT NOT NULL,
  "yearStart" INTEGER NOT NULL,
  "approvedBy" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organizationCount" INTEGER NOT NULL,
  "appointmentCount" INTEGER NOT NULL,
  CONSTRAINT "RosterImportBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RosterImportBatch_sourceDigest_key" ON "RosterImportBatch"("sourceDigest");
CREATE TABLE "AnnualAppointment" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "yearStart" INTEGER NOT NULL,
  "organizationId" TEXT NOT NULL,
  "positionName" TEXT NOT NULL,
  "personName" TEXT NOT NULL,
  "homeClubSourceName" TEXT,
  "listingNature" TEXT NOT NULL,
  "sourcePage" TEXT NOT NULL,
  "approvedBy" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnnualAppointment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AnnualAppointment_batchId_sourceKey_key" ON "AnnualAppointment"("batchId", "sourceKey");
CREATE UNIQUE INDEX "AnnualAppointment_yearStart_organizationId_sourceKey_key" ON "AnnualAppointment"("yearStart", "organizationId", "sourceKey");
CREATE INDEX "AnnualAppointment_organizationId_yearStart_idx" ON "AnnualAppointment"("organizationId", "yearStart");
ALTER TABLE "AnnualAppointment" ADD CONSTRAINT "AnnualAppointment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RosterImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnnualAppointment" ADD CONSTRAINT "AnnualAppointment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
