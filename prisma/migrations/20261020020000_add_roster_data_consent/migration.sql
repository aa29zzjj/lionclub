-- Optional roster matching only. No scalar added to Member: core old flows do
-- not query this table. A missing table must fail closed at the feature boundary.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
CREATE TABLE "MemberDataConsent" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemberDataConsent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MemberDataConsent_memberId_purpose_version_key" ON "MemberDataConsent"("memberId", "purpose", "version");
ALTER TABLE "MemberDataConsent" ADD CONSTRAINT "MemberDataConsent_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
