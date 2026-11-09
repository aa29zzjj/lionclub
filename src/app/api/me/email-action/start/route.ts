import { NextRequest } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAppSecrets } from "@/lib/secrets";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { consumeRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { emailActionEnabled, EmailActionError, startEmailAction } from "@/lib/email-action-reauth";
import { emailActionFailure, emailActionJson } from "@/lib/email-action-http";
const schema = z.object({ action: z.enum(["link", "sessions", "delete"]) }).strict();
export async function POST(request: NextRequest) {
  if (!isTrustedBrowserMutation(request)) return emailActionJson({ error: "請從網站操作本人驗證" }, 403);
  try {
    const session = await getSession();
    if (!session) return emailActionJson({ error: "未登入" }, 401);
    if (!emailActionEnabled()) throw new EmailActionError(503, "EMAIL_ACTION_UNAVAILABLE", "信箱本人驗證尚未開放，尚未執行安全操作。");
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return emailActionJson({ error: "請選擇本次安全操作" }, 400);
    const prisma = await getPrisma();
    const limit = await consumeRateLimit(prisma, `email-action-send:ip:${getClientIp(request)}`, 30);
    if (limit.limited) return rateLimitResponse(limit);
    const { AUTH_SECRET } = await getAppSecrets();
    return emailActionJson(await startEmailAction(prisma, session, input.data.action, AUTH_SECRET));
  } catch (error) { return emailActionFailure(error); }
}
