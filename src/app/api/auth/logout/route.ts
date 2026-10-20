import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/session";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { clearOAuthCookie, OAUTH_BROWSER_COOKIE, OAUTH_PENDING_COOKIE, OAUTH_REAUTH_COOKIE } from "@/lib/federated-auth-http";

export async function POST(request: NextRequest) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作登出" }, { status: 403 });
  await destroySession();
  await clearOAuthCookie(OAUTH_BROWSER_COOKIE);
  await clearOAuthCookie(OAUTH_PENDING_COOKIE);
  await clearOAuthCookie(OAUTH_REAUTH_COOKIE);
  return NextResponse.json({ ok: true });
}
