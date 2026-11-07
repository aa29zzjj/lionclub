import { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAppSecrets } from "@/lib/secrets";
import { getClientIp, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { hashOAuthSecret } from "@/lib/federated-auth";
import { nativeOAuthExchangeSchema, readNativeOAuthBody, requireNativeOAuthV2, nativeOAuthJson, nativeOAuthFailure, exchangeNativeOAuthHandoff } from "@/lib/mobile-oauth";

export async function POST(request: NextRequest) {
  try {
    requireNativeOAuthV2();
    const parsed = nativeOAuthExchangeSchema.safeParse(await readNativeOAuthBody(request));
    if (!parsed.success) return nativeOAuthJson({ error: "登入驗證參數不正確，請重新開始。", code: "OAUTH_PROTOCOL_REQUIRED" }, 400);
    const prisma = await getPrisma();
    for (const [key, limit] of [[`native-oauth-exchange:ip:${getClientIp(request)}`, 600], [`native-oauth-exchange:code:${hashOAuthSecret(parsed.data.code)}`, 20]] as const) {
      const rate = await consumeRateLimit(prisma, key, limit);
      if (rate.limited) { const response = rateLimitResponse(rate); response.headers.set("Referrer-Policy", "no-referrer"); return response; }
    }
    const { AUTH_SECRET } = await getAppSecrets();
    return nativeOAuthJson(await exchangeNativeOAuthHandoff(prisma, parsed.data, new TextEncoder().encode(AUTH_SECRET)));
  } catch (error) { return nativeOAuthFailure(error); }
}
