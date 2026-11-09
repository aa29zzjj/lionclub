import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { finishOAuth, readOAuthTransaction } from "@/lib/federated-auth-service";
import { randomOAuthSecret } from "@/lib/federated-auth";
import { configuredOAuthOrigin, resolveOAuthRuntimeSettings } from "@/lib/federated-auth-runtime";
import { OAUTH_BROWSER_COOKIE, oauthErrorCode, readOAuthCookie } from "@/lib/federated-auth-http";
import { isNativeOAuthBinding, NATIVE_OAUTH_REDIRECT_URI, requireNativeOAuthV2, nativeOAuthNoStore, nativeOAuthFailure } from "@/lib/mobile-oauth";

function redirectTo(state: string, params: { code: string } | { error: string }) {
  const next = new URL(NATIVE_OAUTH_REDIRECT_URI);
  next.searchParams.set("state", state); next.searchParams.set("protocolVersion", "2");
  for (const [key, value] of Object.entries(params)) next.searchParams.set(key, value);
  return NextResponse.redirect(next, { status: 303, headers: nativeOAuthNoStore });
}
export async function GET(request: NextRequest) {
  let appState: string | null = null;
  try {
    requireNativeOAuthV2();
    const states = request.nextUrl.searchParams.getAll("state");
    if (states.length !== 1) return new NextResponse("連結已失效，請回到 App 重新開始。", { status: 400, headers: nativeOAuthNoStore });
    const browserSecret = (await readOAuthCookie(OAUTH_BROWSER_COOKIE)) || "";
    const prisma = await getPrisma();
    const peek = await readOAuthTransaction(prisma, states[0], browserSecret);
    if (!isNativeOAuthBinding(peek) || !peek.nativeBootstrapUsedAt) return new NextResponse("App 登入驗證參數不正確。", { status: 400, headers: nativeOAuthNoStore });
    appState = peek.nativeState!;
    const settings = await resolveOAuthRuntimeSettings();
    if (!configuredOAuthOrigin(settings)) throw Error("OAUTH_NOT_CONFIGURED");
    const code = randomOAuthSecret();
    const result = await finishOAuth(prisma, states[0], browserSecret, null, settings, { code });
    if (result.kind !== "login") return redirectTo(appState, { error: result.kind === "register" ? "ACCOUNT_LINK_REQUIRED" : "OAUTH_FAILED" });
    return redirectTo(appState, { code });
  } catch (error) {
    return appState ? redirectTo(appState, { error: oauthErrorCode(error) }) : nativeOAuthFailure(error);
  }
}
