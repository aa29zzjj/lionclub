BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE "Member" ADD COLUMN "privacyConsentedAt" TIMESTAMP(3);
ALTER TABLE "Member" ADD COLUMN "privacyConsentVersion" TEXT;

COMMIT;
