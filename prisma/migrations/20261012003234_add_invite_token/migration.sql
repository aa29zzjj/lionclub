-- AlterTable
ALTER TABLE "ClubInvite" ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "token" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ClubInvite_token_key" ON "ClubInvite"("token");

-- CreateIndex
CREATE INDEX "ClubInvite_organizationId_idx" ON "ClubInvite"("organizationId");

