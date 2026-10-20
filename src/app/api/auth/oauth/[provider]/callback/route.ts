import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { acceptOAuthCallback } from "@/lib/federated-auth-service";
import { FederatedAuthError, isAuthProvider, providerConfig } from "@/lib/federated-auth";
import { OAUTH_BROWSER_COOKIE, oauthErrorCode, oauthNoStore, readOAuthCookie } from "@/lib/federated-auth-http";
async function callback(request: NextRequest, provider: string, body: URLSearchParams) {
  const config = isAuthProvider(provider) ? providerConfig(provider) : null;
  // Origin is configured, never taken from forwarded Host or callback data.
  const origin = config?.origin || (() => { try { return new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").origin; } catch { return "http://localhost:3000"; } })();
  try {
    if (!config || !isAuthProvider(provider)) throw new FederatedAuthError(503, "PROVIDER_DISABLED", "此第三方登入尚未開放");
    if (provider === "apple" && request.method !== "POST" || provider === "google" && request.method !== "GET") throw new FederatedAuthError(400, "OAUTH_FAILED", "不支援的回傳方式");
    if (body.get("error")) throw new FederatedAuthError(400, "OAUTH_CANCELLED", "第三方驗證未完成");
    if (["state", "code", "id_token"].some(key => body.getAll(key).length > 1)) throw new FederatedAuthError(400, "OAUTH_FAILED", "重複驗證參數");
    let appleName: string | undefined;
    if (provider === "apple" && body.get("user") && body.get("user")!.length < 3000) {
      // Apple name is an untrusted one-time display hint, NOT an identity/email.
      try { const user = JSON.parse(body.get("user")!); appleName = [user?.name?.lastName, user?.name?.firstName].filter(value => typeof value === "string").join(" ").slice(0, 100); } catch { /* optional */ }
    }
    await acceptOAuthCallback(await getPrisma(), provider, body.get("state") || "", await readOAuthCookie(OAUTH_BROWSER_COOKIE) || "",
      { code: body.get("code") || "", idToken: body.get("id_token") || undefined, appleName });
    const next = new URL("/api/auth/oauth/complete", origin); next.searchParams.set("state", body.get("state")!);
    return NextResponse.redirect(next, { status: 303, headers: oauthNoStore });
  } catch (error) {
    const next = new URL("/login", origin); next.searchParams.set("oauth_error", oauthErrorCode(error));
    return NextResponse.redirect(next, { status: 303, headers: oauthNoStore });
  }
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) { return callback(request, (await params).provider, request.nextUrl.searchParams); }
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const size = Number(request.headers.get("content-length") || 0);
  const contentType = request.headers.get("content-type") || "";
  if (size > 24000 || !contentType.startsWith("application/x-www-form-urlencoded")) return new NextResponse(null, { status: 400, headers: oauthNoStore });
  const text = await request.text();
  if (text.length > 24000) return new NextResponse(null, { status: 400, headers: oauthNoStore });
  return callback(request, (await params).provider, new URLSearchParams(text));
}
