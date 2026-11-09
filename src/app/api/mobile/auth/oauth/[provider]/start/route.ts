import { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAppSecrets } from "@/lib/secrets";
import { getClientIp, consumeAuthLimits, rateLimitResponse } from "@/lib/rate-limit";
import { beginOAuth } from "@/lib/federated-auth-service";
import { isAuthProvider, randomOAuthSecret } from "@/lib/federated-auth";
import { resolveProviderConfig } from "@/lib/federated-auth-runtime";
import { signOAuthBootstrapToken } from "@/lib/mobile-auth";
import { nativeOAuthStartSchema, readNativeOAuthBody, requireNativeOAuthV2, nativeOAuthJson, nativeOAuthFailure } from "@/lib/mobile-oauth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    requireNativeOAuthV2();
    const { provider } = await params;
    if (!isAuthProvider(provider)) return nativeOAuthJson({ error: "此第三方登入尚未開放", code: "PROVIDER_DISABLED" }, 503);
    const parsed = nativeOAuthStartSchema.safeParse(await readNativeOAuthBody(request));
    if (!parsed.success) return nativeOAuthJson({ error: "App 登入服務需要更新，請先使用會員信箱與密碼登入。", code: "OAUTH_PROTOCOL_REQUIRED" }, 400);
    const config = await resolveProviderConfig(provider);
    if (!config) return nativeOAuthJson({ error: "此第三方登入尚未開放", code: "PROVIDER_DISABLED" }, 503);
    const prisma = await getPrisma();
    const browserSecret = randomOAuthSecret();
    const limited = await consumeAuthLimits(prisma, "oauth-start", getClientIp(request), browserSecret);
    if (limited) { const response = rateLimitResponse(limited); response.headers.set("Referrer-Policy", "no-referrer"); return response; }
    const { state, codeChallenge, redirectUri } = parsed.data;
    const result = await beginOAuth(prisma, provider, "login", browserSecret, null, false, new Date(), undefined, config, redirectUri, undefined, { state, codeChallenge });
    if (!result.nativeTransactionId) throw Error("NATIVE_TRANSACTION_REQUIRED");
    const { AUTH_SECRET } = await getAppSecrets();
    const bootstrapToken = await signOAuthBootstrapToken({ transactionId: result.nativeTransactionId, provider, browserSecret, authorizationUrl: result.authorizationUrl }, new TextEncoder().encode(AUTH_SECRET));
    const bootstrapUrl = new URL("/api/mobile/auth/oauth/bootstrap", config.origin);
    bootstrapUrl.searchParams.set("token", bootstrapToken);
    return nativeOAuthJson({ protocolVersion: 2, state, bootstrapUrl: bootstrapUrl.toString() });
  } catch (error) { return nativeOAuthFailure(error); }
}
