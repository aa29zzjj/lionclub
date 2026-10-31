-- Additive only. Null means an existing web OAuth flow; existing rows unaffected.
ALTER TABLE "OAuthTransaction" ADD COLUMN "nativeRedirectUri" TEXT;
