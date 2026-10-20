-- Additive OAuth rollout: existing password authentication works before activation.
-- Do not enable FEDERATED_AUTH_ENABLED until this migration has completed.
BEGIN;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE TABLE "FederatedIdentity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "refreshTokenCiphertext" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FederatedIdentity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FederatedIdentity_provider_subject_key" ON "FederatedIdentity"("provider", "subject");
CREATE UNIQUE INDEX "FederatedIdentity_userId_provider_key" ON "FederatedIdentity"("userId", "provider");
ALTER TABLE "FederatedIdentity" ADD CONSTRAINT "FederatedIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OAuthTransaction" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "browserHash" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "codeVerifier" TEXT,
  "inviteToken" TEXT,
  "userId" TEXT,
  "sessionVersion" INTEGER,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "claimedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "subject" TEXT,
  "email" TEXT,
  "providerName" TEXT,
  "refreshTokenCiphertext" TEXT,
  "reauthHash" TEXT,
  "reauthExpiresAt" TIMESTAMP(3),
  "reauthUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OAuthTransaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OAuthTransaction_stateHash_key" ON "OAuthTransaction"("stateHash");
CREATE UNIQUE INDEX "OAuthTransaction_reauthHash_key" ON "OAuthTransaction"("reauthHash");
CREATE INDEX "OAuthTransaction_expiresAt_idx" ON "OAuthTransaction"("expiresAt");
CREATE INDEX "OAuthTransaction_userId_reauthExpiresAt_idx" ON "OAuthTransaction"("userId", "reauthExpiresAt");
ALTER TABLE "OAuthTransaction" ADD CONSTRAINT "OAuthTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
