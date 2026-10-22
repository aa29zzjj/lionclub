import type { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { resolveOAuthOrigin } from "@/lib/federated-auth-runtime";
import { cancelOAuthBrowser, isMissingFederatedTable } from "@/lib/federated-auth-service";
import { clearOAuthCookie, OAUTH_BROWSER_COOKIE, OAUTH_PENDING_COOKIE, OAUTH_REAUTH_COOKIE, oauthErrorResponse, oauthJson, readOAuthCookie } from "@/lib/federated-auth-http";
export async function POST(request: NextRequest) {
  if (!request.headers.get("origin")) return oauthJson({ error: "請從網站操作取消驗證" }, 403);
  try {
    const origin = await resolveOAuthOrigin();
    if (!origin || !isTrustedBrowserMutation(request, origin)) return oauthJson({ error: "請從網站操作取消驗證" }, 403);
    const browser = await readOAuthCookie(OAUTH_BROWSER_COOKIE), proof = await readOAuthCookie(OAUTH_REAUTH_COOKIE);
    // Clear browser capability even if the DB later fails; do not retry pending
    // signup or claim success about scrubbing when a non-missing-table DB fails.
    await clearOAuthCookie(OAUTH_BROWSER_COOKIE); await clearOAuthCookie(OAUTH_PENDING_COOKIE); await clearOAuthCookie(OAUTH_REAUTH_COOKIE);
    if (browser || proof) {
      try { await cancelOAuthBrowser(await getPrisma(), browser, proof); }
      catch (error) { if (!isMissingFederatedTable(error)) throw error; }
    }
    return oauthJson({ ok: true });
  } catch (error) { return oauthErrorResponse(error); }
}
