import type { NextRequest } from "next/server";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { resolveMobilePushSettings } from "@/lib/mobile-push-runtime";
import { MobilePushError, registerMobilePushDevice, disableMobilePushDevice, pushRegistrationSchema, pushDisableSchema } from "@/lib/mobile-push";
import { mobilePushBody, mobilePushFailure, mobilePushJson } from "@/lib/mobile-push-http";
export const runtime = "nodejs";
async function change(request: NextRequest, disabling: boolean) {
  try {
    const auth = await requireMobileMember(request);
    if (!auth) return mobilePushJson({ error: "未登入或登入已過期", code: "UNAUTHENTICATED" }, 401);
    const settings = await resolveMobilePushSettings();
    if (!settings.enabled) throw new MobilePushError(503, "PUSH_UNAVAILABLE", "手機推播尚未啟用，站內通知仍可使用");
    const limit = await consumeRateLimit(auth.prisma, `mobile-push:${disabling ? "disable" : "register"}:actor:${auth.session.userId}`, disabling ? 60 : 30);
    if (limit.limited) return rateLimitResponse(limit);
    const body = await mobilePushBody(request);
    if (disabling) {
      const input = pushDisableSchema.safeParse(body);
      if (!input.success) return mobilePushJson({ error: "請提供有效的裝置與設定版本", code: "INVALID_PUSH_SETTINGS" }, 400);
      return mobilePushJson(await disableMobilePushDevice(auth.prisma, auth.session, input.data, settings));
    }
    const input = pushRegistrationSchema.safeParse(body);
    if (!input.success) return mobilePushJson({ error: "請提供有效的裝置、設定版本與通知授權", code: "INVALID_PUSH_SETTINGS" }, 400);
    return mobilePushJson(await registerMobilePushDevice(auth.prisma, auth.session, input.data, settings));
  } catch (error) { return mobilePushFailure(error); }
}
export async function POST(request: NextRequest) { return change(request, false); }
export async function DELETE(request: NextRequest) { return change(request, true); }
