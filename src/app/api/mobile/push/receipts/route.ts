import type { NextRequest } from "next/server";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { MobilePushError, mobilePushReceiptFeed, pushReceiptReadSchema, readMobilePushReceipts } from "@/lib/mobile-push";
import { resolveMobilePushSettings } from "@/lib/mobile-push-runtime";
import { mobilePushBody, mobilePushFailure, mobilePushJson } from "@/lib/mobile-push-http";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const auth = await requireMobileMember(request);
    if (!auth) return mobilePushJson({ error: "未登入或登入已過期", code: "UNAUTHENTICATED" }, 401);
    return mobilePushJson(await mobilePushReceiptFeed(auth.prisma, auth.session, await resolveMobilePushSettings()));
  } catch (error) { return mobilePushFailure(error); }
}
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireMobileMember(request);
    if (!auth) return mobilePushJson({ error: "未登入或登入已過期", code: "UNAUTHENTICATED" }, 401);
    const settings = await resolveMobilePushSettings();
    if (!settings.enabled) throw new MobilePushError(503, "PUSH_UNAVAILABLE", "手機推播尚未啟用，站內通知仍可使用");
    const limit = await consumeRateLimit(auth.prisma, `mobile-push:receipt-read:actor:${auth.session.userId}`, 60);
    if (limit.limited) return rateLimitResponse(limit);
    const input = pushReceiptReadSchema.safeParse(await mobilePushBody(request));
    if (!input.success) return mobilePushJson({ error: "請選擇有效的本人通知", code: "INVALID_PUSH_SETTINGS" }, 400);
    return mobilePushJson(await readMobilePushReceipts(auth.prisma, auth.session, input.data.ids, settings));
  } catch (error) { return mobilePushFailure(error); }
}
