-- Additive and nullable: existing web transactions retain their behavior.
-- Deploy this migration before server code; keep MOBILE_OAUTH_V2_ENABLED off
-- until the matching App v2 flow and provider acceptance are verified.
ALTER TABLE "OAuthTransaction"
  ADD COLUMN "nativeState" TEXT,
  ADD COLUMN "nativeCodeChallenge" TEXT,
  ADD COLUMN "nativeBootstrapUsedAt" TIMESTAMP(3),
  ADD COLUMN "nativeHandoffHash" TEXT,
  ADD COLUMN "nativeHandoffExpiresAt" TIMESTAMP(3),
  ADD COLUMN "nativeHandoffUsedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "OAuthTransaction_nativeHandoffHash_key" ON "OAuthTransaction"("nativeHandoffHash");
