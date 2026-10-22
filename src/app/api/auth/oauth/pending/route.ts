import { getPrisma } from "@/lib/prisma";
import { readOAuthTransaction } from "@/lib/federated-auth-service";
import { resolveOAuthRuntimeSettings } from "@/lib/federated-auth-runtime";
import { isAuthProvider, providerConfig } from "@/lib/federated-auth";
import { OAUTH_BROWSER_COOKIE, OAUTH_PENDING_COOKIE, oauthErrorResponse, oauthJson, readOAuthCookie } from "@/lib/federated-auth-http";
export async function GET() {
  const state = await readOAuthCookie(OAUTH_PENDING_COOKIE);
  if (!state) return oauthJson({ pending: false });
  try {
    const settings = await resolveOAuthRuntimeSettings();
    if (!providerConfig("google", settings)) return oauthJson({ pending: false });
    const row = await readOAuthTransaction(await getPrisma(), state, await readOAuthCookie(OAUTH_BROWSER_COOKIE) || "");
    if (row.purpose !== "login" || !row.verifiedAt || !row.subject || !row.email || !isAuthProvider(row.provider) || !providerConfig(row.provider, settings)) return oauthJson({ pending: false });
    return oauthJson({ pending: true, provider: row.provider, email: row.email, name: row.providerName, hasInvite: Boolean(row.inviteToken) });
  } catch (error) { return oauthErrorResponse(error); }
}
