import { NextResponse } from "next/server";
import { EmailActionError } from "./email-action-reauth";
export const emailActionJson = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
export function emailActionFailure(error: unknown) {
  if (error instanceof EmailActionError) {
    const response = emailActionJson({ error: error.message, code: error.code }, error.status);
    if (error.retryAfterSeconds) response.headers.set("Retry-After", String(error.retryAfterSeconds));
    return response;
  }
  if (error && typeof error === "object" && "code" in error && error.code === "P2034") return emailActionJson({ error: "身分或驗證同時更新，請重新開始。", code: "EMAIL_ACTION_CONFLICT" }, 409);
  return emailActionJson({ error: "信箱本人驗證尚未確認，請稍後重試；尚未執行安全操作。", code: "EMAIL_ACTION_UNAVAILABLE" }, 503);
}
