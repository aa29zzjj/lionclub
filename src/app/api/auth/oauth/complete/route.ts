import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { createSession, getSession } from "@/lib/session";
import { finishOAuth } from "@/lib/federated-auth-service";
import { OAUTH_BROWSER_COOKIE, OAUTH_PENDING_COOKIE, OAUTH_REAUTH_COOKIE, oauthErrorCode, oauthNoStore, readOAuthCookie, setOAuthCookie } from "@/lib/federated-auth-http";
export async function GET(request: NextRequest) {
  let origin: string;
  try { origin = new URL(process.env.NEXT_PUBLIC_APP_URL || "").origin; } catch { return new NextResponse(null, { status: 503 }); }
  try {
    const state = request.nextUrl.searchParams.get("state") || "";
    const result = await finishOAuth(await getPrisma(), state, await readOAuthCookie(OAUTH_BROWSER_COOKIE) || "", await getSession());
    let path = "/home";
    if (result.kind === "register") { await setOAuthCookie(OAUTH_PENDING_COOKIE, state, 10 * 60); path = "/auth/complete"; }
    if (result.kind === "login") await createSession(result.session);
    if (result.kind === "linked") path = "/profile?oauth=linked";
    if (result.kind === "reauthenticated") { await setOAuthCookie(OAUTH_REAUTH_COOKIE, result.proof, 5 * 60); path = result.deletion ? "/account/delete?oauth=reauthenticated" : "/profile?oauth=reauthenticated"; }
    return NextResponse.redirect(new URL(path, origin), { status: 303, headers: oauthNoStore });
  } catch (error) {
    const next = new URL("/login", origin); next.searchParams.set("oauth_error", oauthErrorCode(error));
    return NextResponse.redirect(next, { status: 303, headers: oauthNoStore });
  }
}
