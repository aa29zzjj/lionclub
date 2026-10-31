import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getAppSecrets } from "@/lib/secrets";
import { getClientIp, consumeAuthLimits, rateLimitResponse } from "@/lib/rate-limit";
import { beginOAuth } from "@/lib/federated-auth-service";
import { FederatedAuthError, isAuthProvider, randomOAuthSecret } from "@/lib/federated-auth";
import { resolveProviderConfig } from "@/lib/federated-auth-runtime";
import { signOAuthBootstrapToken } from "@/lib/mobile-auth";

/** Only the native app's own custom-scheme callback is accepted, to stop this from
 * becoming an open redirect to an arbitrary nativeRedirectUri. */
const ALLOWED_NATIVE_REDIRECT_URI = "com.lionclubsmembership.app://oauth-callback";

const schema = z.object({ redirectUri: z.literal(ALLOWED_NATIVE_REDIRECT_URI) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isAuthProvider(provider)) return NextResponse.json({ error: "此第三方登入尚未開放", code: "PROVIDER_DISABLED" }, { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少或不正確的 redirectUri" }, { status: 400 });

  try {
    const config = await resolveProviderConfig(provider);
    if (!config) return NextResponse.json({ error: "此第三方登入尚未開放", code: "PROVIDER_DISABLED" }, { status: 503 });
    const prisma = await getPrisma();
    const browserSecret = randomOAuthSecret();
    const limited = await consumeAuthLimits(prisma, "oauth-start", getClientIp(request), browserSecret);
    if (limited) return rateLimitResponse(limited);

    const result = await beginOAuth(prisma, provider, "login", browserSecret, null, false, new Date(), undefined, config, parsed.data.redirectUri);

    const { AUTH_SECRET } = await getAppSecrets();
    const key = new TextEncoder().encode(AUTH_SECRET);
    const bootstrapToken = await signOAuthBootstrapToken({ provider, browserSecret, authorizationUrl: result.authorizationUrl }, key);
    const bootstrapUrl = new URL("/api/mobile/auth/oauth/bootstrap", config.origin);
    bootstrapUrl.searchParams.set("token", bootstrapToken);

    return NextResponse.json({ bootstrapUrl: bootstrapUrl.toString() });
  } catch (error) {
    if (error instanceof FederatedAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "第三方驗證暫時無法開始，請重新嘗試" }, { status: 503 });
  }
}
