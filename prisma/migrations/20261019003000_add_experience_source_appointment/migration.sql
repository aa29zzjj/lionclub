BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE "MemberExperience" ADD COLUMN "sourceAppointmentId" TEXT;
CREATE UNIQUE INDEX "MemberExperience_sourceAppointmentId_key" ON "MemberExperience"("sourceAppointmentId");
ALTER TABLE "MemberExperience" ADD CONSTRAINT "MemberExperience_sourceAppointmentId_fkey" FOREIGN KEY ("sourceAppointmentId") REFERENCES "AnnualAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
