import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { consumeAuthLimits, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { beginOAuth, consumeOAuthReauth } from "@/lib/federated-auth-service";
import { FederatedAuthError, isAuthProvider, randomOAuthSecret, validOAuthSecret } from "@/lib/federated-auth";
import { resolveProviderConfig } from "@/lib/federated-auth-runtime";
import { oauthErrorResponse, oauthJson, OAUTH_BROWSER_COOKIE, OAUTH_REAUTH_COOKIE, readOAuthCookie, setOAuthCookie } from "@/lib/federated-auth-http";
const schema = z.object({ purpose: z.enum(["login", "link", "reauth"]).default("login"), password: z.string().max(200).optional(), token: z.string().min(1).max(200).optional(), oauthConsent: z.literal(true).optional() });
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  if (!request.headers.get("origin")) return oauthJson({ error: "請從網站操作第三方登入" }, 403);
  const { provider } = await params;
  if (!isAuthProvider(provider)) return oauthJson({ error: "此第三方登入尚未開放", code: "PROVIDER_DISABLED" }, 503);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return oauthJson({ error: "驗證參數不正確" }, 400);
  try {
    const config = await resolveProviderConfig(provider);
    if (!config) return oauthJson({ error: "此第三方登入尚未開放", code: "PROVIDER_DISABLED" }, 503);
    if (!isTrustedBrowserMutation(request, config.origin)) return oauthJson({ error: "請從網站操作第三方登入" }, 403);
    const prisma = await getPrisma(), session = await getSession();
    let browserSecret = await readOAuthCookie(OAUTH_BROWSER_COOKIE);
    if (!validOAuthSecret(browserSecret)) browserSecret = randomOAuthSecret();
    const limited = await consumeAuthLimits(prisma, "oauth-start", getClientIp(request), session?.userId || browserSecret);
    if (limited) return rateLimitResponse(limited);
    let confirmed = false;
    if (parsed.data.purpose === "link") {
      if (!session) throw new FederatedAuthError(401, "LOGIN_REQUIRED", "請先登入本人帳號");
      if (parsed.data.oauthConsent !== true) throw new FederatedAuthError(400, "OAUTH_CONSENT_REQUIRED", "請先同意連結第三方帳號及資料處理");
      const user = await prisma.user.findUnique({ where: { id: session.userId } });
      confirmed = Boolean(user?.passwordHash && parsed.data.password && await bcrypt.compare(parsed.data.password, user.passwordHash));
      if (!confirmed) confirmed = await consumeOAuthReauth(prisma, session, await readOAuthCookie(OAUTH_REAUTH_COOKIE), "link");
    }
    const result = await beginOAuth(prisma, provider, parsed.data.purpose, browserSecret, session, confirmed, new Date(), parsed.data.token, config);
    await setOAuthCookie(OAUTH_BROWSER_COOKIE, browserSecret, 15 * 60, true, config.origin);
    return oauthJson(result);
  } catch (error) { return oauthErrorResponse(error); }
}
