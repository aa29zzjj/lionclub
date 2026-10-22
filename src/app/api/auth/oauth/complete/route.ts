import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { createSession, getSession } from "@/lib/session";
import { finishOAuth } from "@/lib/federated-auth-service";
import { configuredOAuthOrigin, resolveOAuthRuntimeSettings } from "@/lib/federated-auth-runtime";
import type { OAuthRuntimeSettings } from "@/lib/runtime-secrets";
import { OAUTH_BROWSER_COOKIE, OAUTH_PENDING_COOKIE, OAUTH_REAUTH_COOKIE, oauthErrorCode, oauthNoStore, readOAuthCookie, setOAuthCookie } from "@/lib/federated-auth-http";
export async function GET(request: NextRequest) {
  let origin: string | null;
  let settings: OAuthRuntimeSettings;
  try { settings = await resolveOAuthRuntimeSettings(); origin = configuredOAuthOrigin(settings); } catch { return new NextResponse(null, { status: 503, headers: oauthNoStore }); }
  if (!origin) return new NextResponse(null, { status: 503, headers: oauthNoStore });
  try {
    const state = request.nextUrl.searchParams.get("state") || "";
    const result = await finishOAuth(await getPrisma(), state, await readOAuthCookie(OAUTH_BROWSER_COOKIE) || "", await getSession(), settings);
    let path = "/home";
    if (result.kind === "register") { await setOAuthCookie(OAUTH_PENDING_COOKIE, state, 10 * 60, false, origin); path = "/auth/complete"; }
    if (result.kind === "login") await createSession(result.session);
    if (result.kind === "linked") path = "/profile?oauth=linked";
    if (result.kind === "reauthenticated") { await setOAuthCookie(OAUTH_REAUTH_COOKIE, result.proof, 5 * 60, false, origin); path = "/profile?oauth=reauthenticated"; }
    return NextResponse.redirect(new URL(path, origin), { status: 303, headers: oauthNoStore });
  } catch (error) {
    const next = new URL("/login", origin); next.searchParams.set("oauth_error", oauthErrorCode(error));
    return NextResponse.redirect(next, { status: 303, headers: oauthNoStore });
  }
}
