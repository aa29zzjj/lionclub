import { NextRequest } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAppSecrets } from "@/lib/secrets";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { EMAIL_ACTION_COOKIE, EMAIL_ACTION_PROOF_TTL_MS, emailActionEnabled, EmailActionError, verifyEmailAction } from "@/lib/email-action-reauth";
import { setOAuthCookie } from "@/lib/federated-auth-http";
import { emailActionFailure, emailActionJson } from "@/lib/email-action-http";
const schema = z.object({ challengeId: z.string().uuid(), action: z.enum(["link", "sessions", "delete"]), code: z.string().regex(/^[0-9]{6}$/) }).strict();
export async function POST(request: NextRequest) {
  if (!isTrustedBrowserMutation(request)) return emailActionJson({ error: "請從網站操作本人驗證" }, 403);
  try {
    const session = await getSession();
    if (!session) return emailActionJson({ error: "未登入" }, 401);
    if (!emailActionEnabled()) throw new EmailActionError(503, "EMAIL_ACTION_UNAVAILABLE", "信箱本人驗證尚未開放，尚未執行安全操作。");
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return emailActionJson({ error: "請輸入本次六位數驗證碼" }, 400);
    const prisma = await getPrisma(), limit = await consumeRateLimit(prisma, `email-action-verify:${session.userId}`, 30);
    if (limit.limited) return rateLimitResponse(limit);
    const { AUTH_SECRET } = await getAppSecrets();
    const result = await verifyEmailAction(prisma, session, input.data, AUTH_SECRET);
    await setOAuthCookie(EMAIL_ACTION_COOKIE, result.proof, EMAIL_ACTION_PROOF_TTL_MS / 1000);
    return emailActionJson({ ok: true, memberId: result.memberId, action: result.action, proofExpiresAt: result.proofExpiresAt.toISOString() });
  } catch (error) { return emailActionFailure(error); }
}
