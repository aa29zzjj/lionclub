import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { finishOAuth, readOAuthTransaction } from "@/lib/federated-auth-service";
import { configuredOAuthOrigin, resolveOAuthRuntimeSettings } from "@/lib/federated-auth-runtime";
import { OAUTH_BROWSER_COOKIE, oauthErrorCode, oauthNoStore, readOAuthCookie } from "@/lib/federated-auth-http";
import { getAppSecrets } from "@/lib/secrets";
import { signOAuthHandoffCode } from "@/lib/mobile-auth";

function redirectTo(nativeRedirectUri: string, params: Record<string, string>) {
  const next = new URL(nativeRedirectUri);
  for (const [key, value] of Object.entries(params)) next.searchParams.set(key, value);
  return NextResponse.redirect(next, { status: 303, headers: oauthNoStore });
}

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state") || "";
  const browserSecret = (await readOAuthCookie(OAUTH_BROWSER_COOKIE)) || "";
  const prisma = await getPrisma();

  // Only used to recover the app's own callback scheme for every exit path below (including
  // failures) - it does not mutate or claim the transaction. finishOAuth() re-reads it for real.
  let nativeRedirectUri: string | null = null;
  try {
    const peek = await readOAuthTransaction(prisma, state, browserSecret);
    nativeRedirectUri = peek.nativeRedirectUri;
  } catch {
    // fall through; error path below has no app scheme to redirect to
  }
  if (!nativeRedirectUri) return new NextResponse("連結已失效或已使用，請回到 App 重新開始登入。", { status: 400, headers: oauthNoStore });

  try {
    const settings = await resolveOAuthRuntimeSettings();
    if (!configuredOAuthOrigin(settings)) throw new Error("OAUTH_NOT_CONFIGURED");
    const result = await finishOAuth(prisma, state, browserSecret, null, settings);
    if (result.kind !== "login") {
      // Native v1 only supports signing in with an existing linked identity; registering a new
      // member, linking, and reauth-for-sensitive-actions stay web-only for now.
      return redirectTo(nativeRedirectUri, { error: result.kind === "register" ? "ACCOUNT_LINK_REQUIRED" : "OAUTH_FAILED" });
    }
    const { AUTH_SECRET } = await getAppSecrets();
    const key = new TextEncoder().encode(AUTH_SECRET);
    const code = await signOAuthHandoffCode(result.session, key);
    return redirectTo(nativeRedirectUri, { code });
  } catch (error) {
    return redirectTo(nativeRedirectUri, { error: oauthErrorCode(error) });
  }
}
