import { NextRequest, NextResponse } from "next/server";
import { getAppSecrets } from "@/lib/secrets";
import { readOAuthBootstrapToken } from "@/lib/mobile-auth";
import { OAUTH_BROWSER_COOKIE, setOAuthCookie } from "@/lib/federated-auth-http";

/** Runs inside the native app's ASWebAuthenticationSession (a real browser session, separate
 * from the app's own CapacitorHttp cookie jar). Sets the OAUTH_BROWSER_COOKIE in THIS session
 * before handing off to the real provider, so the later callback's existing cookie-binding check
 * (readOAuthTransaction) keeps working unchanged for native flows too. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  const { AUTH_SECRET } = await getAppSecrets();
  const key = new TextEncoder().encode(AUTH_SECRET);
  const bootstrap = await readOAuthBootstrapToken(token, key);
  if (!bootstrap) return new NextResponse("連結已失效或已使用，請回到 App 重新開始登入。", { status: 400 });

  await setOAuthCookie(OAUTH_BROWSER_COOKIE, bootstrap.browserSecret, 15 * 60, true);
  return NextResponse.redirect(bootstrap.authorizationUrl, { status: 303, headers: { "Cache-Control": "no-store" } });
}
