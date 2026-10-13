-- Additive migration only: do not move/activate existing members or change accounts.
ALTER TABLE "Member"
ADD COLUMN "organizationAssignmentStatus" TEXT NOT NULL DEFAULT 'ASSIGNED',
ADD COLUMN "organizationAssignmentVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "declaredOrganizationName" TEXT;

CREATE INDEX "Member_organizationAssignmentStatus_organizationId_idx"
ON "Member"("organizationAssignmentStatus", "organizationId");

CREATE TABLE "MemberOrganizationAssignment" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "fromOrganizationId" TEXT,
  "fromOrganizationName" TEXT,
  "toOrganizationId" TEXT NOT NULL,
  "toOrganizationName" TEXT NOT NULL,
  "previousAssignmentStatus" TEXT NOT NULL,
  "assignmentStatus" TEXT NOT NULL,
  "assignedById" TEXT,
  "reason" TEXT NOT NULL,
  "revokedRoleNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "revokedInviteCount" INTEGER NOT NULL DEFAULT 0,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemberOrganizationAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MemberOrganizationAssignment_memberId_assignedAt_idx"
ON "MemberOrganizationAssignment"("memberId", "assignedAt");

ALTER TABLE "MemberOrganizationAssignment" ADD CONSTRAINT "MemberOrganizationAssignment_memberId_fkey"
FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberOrganizationAssignment" ADD CONSTRAINT "MemberOrganizationAssignment_assignedById_fkey"
FOREIGN KEY ("assignedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
