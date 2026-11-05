import { NextResponse } from "next/server";
import { MobilePushError } from "./mobile-push";
export function mobilePushJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
export async function mobilePushBody(request: Request) {
  const text = await request.text();
  if (text.length > 4096) throw new MobilePushError(413, "PUSH_BODY_TOO_LARGE", "通知設定內容過長");
  try { return JSON.parse(text); } catch { return null; }
}
export function mobilePushFailure(error: unknown) {
  if (error instanceof MobilePushError) return mobilePushJson({ error: error.message, code: error.code }, error.status);
  if (error && typeof error === "object" && "code" in error && ["P2002", "P2034", "P2025"].includes(String(error.code))) {
    return mobilePushJson({ error: "通知設定同時更新，請重新確認", code: "PUSH_REVISION_CONFLICT" }, 409);
  }
  // No raw database, encryption or provider errors (or tokens) in responses/logs.
  return mobilePushJson({ error: "手機通知設定暫時無法確認，請稍後重試", code: "PUSH_UNAVAILABLE" }, 503);
}
