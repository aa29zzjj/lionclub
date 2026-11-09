-- Additive and opt-in. Never trust/backfill legacy identity email provenance.
ALTER TABLE "FederatedIdentity" ADD COLUMN "securityEmailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "OAuthTransaction" ADD COLUMN "emailActionChallengeId" UUID;
CREATE TABLE "EmailActionChallenge" (
  "id" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "sessionVersion" INTEGER NOT NULL,
  "identityId" TEXT NOT NULL,
  "identityUpdatedAt" TIMESTAMP(3) NOT NULL,
  "identityVerifiedAt" TIMESTAMP(3) NOT NULL,
  "email" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "codeHash" CHAR(64),
  "deliveryState" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "invalidatedAt" TIMESTAMP(3),
  "proofHash" CHAR(64),
  "proofExpiresAt" TIMESTAMP(3),
  "proofUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailActionChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailActionChallenge_action_check" CHECK ("action" IN ('link', 'sessions', 'delete')),
  CONSTRAINT "EmailActionChallenge_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5 AND "sessionVersion" >= 0),
  CONSTRAINT "EmailActionChallenge_delivery_check" CHECK ("deliveryState" IN ('PENDING', 'SENT', 'FAILED')),
  CONSTRAINT "EmailActionChallenge_expiry_check" CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + INTERVAL '10 minutes'),
  CONSTRAINT "EmailActionChallenge_proof_check" CHECK ("proofHash" IS NULL OR ("verifiedAt" IS NOT NULL AND "proofExpiresAt" > "verifiedAt" AND "proofExpiresAt" <= "verifiedAt" + INTERVAL '5 minutes'))
);
CREATE UNIQUE INDEX "EmailActionChallenge_proofHash_key" ON "EmailActionChallenge"("proofHash");
CREATE INDEX "EmailActionChallenge_userId_action_createdAt_idx" ON "EmailActionChallenge"("userId", "action", "createdAt");
CREATE INDEX "EmailActionChallenge_expiresAt_idx" ON "EmailActionChallenge"("expiresAt");
ALTER TABLE "EmailActionChallenge" ADD CONSTRAINT "EmailActionChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailActionChallenge" ADD CONSTRAINT "EmailActionChallenge_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailActionChallenge" ADD CONSTRAINT "EmailActionChallenge_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "FederatedIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
