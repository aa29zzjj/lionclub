-- Additive only. Null means no action binding was recorded; consumeOAuthReauth
-- treats a null/mismatched reauthAction as "not valid for this action" (fails closed).
ALTER TABLE "OAuthTransaction" ADD COLUMN "reauthAction" TEXT;
