import { NextRequest, NextResponse } from "next/server";
import { getAppSecrets } from "@/lib/secrets";
import { getPrisma } from "@/lib/prisma";
import { readOAuthBootstrapToken } from "@/lib/mobile-auth";
import { OAUTH_BROWSER_COOKIE, setOAuthCookie } from "@/lib/federated-auth-http";
import { consumeNativeOAuthBootstrap, requireNativeOAuthV2, nativeOAuthNoStore, nativeOAuthFailure } from "@/lib/mobile-oauth";

/** Claim this browser bootstrap once, before setting its HttpOnly cookie. */
export async function GET(request: NextRequest) {
  try {
    requireNativeOAuthV2();
    const tokens = request.nextUrl.searchParams.getAll("token");
    if (tokens.length !== 1 || !tokens[0] || tokens[0].length > 16000) return new NextResponse("連結已失效，請回到 App 重新開始。", { status: 400, headers: nativeOAuthNoStore });
    const { AUTH_SECRET } = await getAppSecrets();
    const bootstrap = await readOAuthBootstrapToken(tokens[0], new TextEncoder().encode(AUTH_SECRET));
    if (!bootstrap) return new NextResponse("連結已失效或已使用，請回到 App 重新開始。", { status: 400, headers: nativeOAuthNoStore });
    await consumeNativeOAuthBootstrap(await getPrisma(), bootstrap);
    await setOAuthCookie(OAUTH_BROWSER_COOKIE, bootstrap.browserSecret, 15 * 60, true);
    return NextResponse.redirect(bootstrap.authorizationUrl, { status: 303, headers: nativeOAuthNoStore });
  } catch (error) { return nativeOAuthFailure(error); }
}
