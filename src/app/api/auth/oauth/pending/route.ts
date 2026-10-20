import { getPrisma } from "@/lib/prisma";
import { readOAuthTransaction } from "@/lib/federated-auth-service";
import { OAUTH_BROWSER_COOKIE, OAUTH_PENDING_COOKIE, oauthErrorResponse, oauthJson, readOAuthCookie } from "@/lib/federated-auth-http";
export async function GET() {
  if (process.env.FEDERATED_AUTH_ENABLED !== "true") return oauthJson({ pending: false });
  const state = await readOAuthCookie(OAUTH_PENDING_COOKIE);
  if (!state) return oauthJson({ pending: false });
  try {
    const row = await readOAuthTransaction(await getPrisma(), state, await readOAuthCookie(OAUTH_BROWSER_COOKIE) || "");
    if (row.purpose !== "login" || !row.verifiedAt || !row.subject || !row.email) return oauthJson({ pending: false });
    return oauthJson({ pending: true, provider: row.provider, email: row.email, name: row.providerName, hasInvite: Boolean(row.inviteToken) });
  } catch (error) { return oauthErrorResponse(error); }
}
