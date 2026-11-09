import type { NextRequest } from "next/server";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { publicMobilePushConfig } from "@/lib/mobile-push-config";
import { resolveMobilePushSettings } from "@/lib/mobile-push-runtime";
import { mobilePushFailure, mobilePushJson } from "@/lib/mobile-push-http";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    if (!await requireMobileMember(request)) return mobilePushJson({ error: "未登入或登入已過期", code: "UNAUTHENTICATED" }, 401);
    return mobilePushJson(publicMobilePushConfig(await resolveMobilePushSettings()));
  } catch (error) { return mobilePushFailure(error); }
}
