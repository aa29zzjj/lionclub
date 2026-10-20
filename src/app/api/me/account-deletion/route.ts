import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { getSession, destroySession } from "@/lib/session";
import { AccountDeletionError, anonymizeAccount } from "@/lib/account-deletion";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { consumeOAuthReauth, revokeLinkedAppleBeforeDeletion } from "@/lib/federated-auth-service";
import { FederatedAuthError } from "@/lib/federated-auth";
import { OAUTH_REAUTH_COOKIE, clearOAuthCookie, readOAuthCookie } from "@/lib/federated-auth-http";

const bodySchema = z.object({ password: z.string().min(1).max(200).optional() });

export async function POST(request: NextRequest) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作帳號刪除" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const prisma = await getPrisma();
  // Authenticated actor, not shared Wi-Fi: wrong passwords and malformed attempts
  // also consume the five-attempt/10-minute window before bcrypt or any deletion.
  const limit = await consumeRateLimit(prisma, `account-deletion:actor:${session.userId}`, 5);
  if (limit.limited) return rateLimitResponse(limit);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請輸入密碼確認" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: "找不到帳號" }, { status: 404 });

  try {
    if (user.passwordHash) {
      if (!parsed.data.password) return NextResponse.json({ error: "請輸入密碼確認" }, { status: 400 });
      if (!await bcrypt.compare(parsed.data.password, user.passwordHash)) return NextResponse.json({ error: "密碼不正確" }, { status: 401 });
    } else {
      if (!await consumeOAuthReauth(prisma, session, await readOAuthCookie(OAUTH_REAUTH_COOKIE), "delete")) return NextResponse.json({ error: "請先以已連結的第三方帳號重新驗證本人身分", code: "REAUTH_REQUIRED" }, { status: 401 });
      await clearOAuthCookie(OAUTH_REAUTH_COOKIE);
    }
    // Avoid revoking Apple while a known handoff blocker already prevents deletion.
    const now = new Date();
    if (await prisma.adminRole.count({ where: { memberId: me.id, OR: [{ validUntil: null }, { validUntil: { gt: now } }] } })) throw new AccountDeletionError(409, "您仍持有有效或預定的幹部權限，請先由其他管理者撤銷後再刪除帳號");
    if (await prisma.event.count({ where: { createdById: me.id, startAt: { gte: now } } })) throw new AccountDeletionError(409, "您有尚未開始的活動，請先安排交接後再刪除帳號");
    const identities = await revokeLinkedAppleBeforeDeletion(prisma, user.id);
    const result = await anonymizeAccount(prisma, { memberId: me.id, userId: user.id, expectedPasswordHash: user.passwordHash,
      expectedSessionVersion: session.sessionVersion, expectedFederatedIdentities: identities,
      bucket: process.env.AVATAR_BUCKET_NAME, region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-northeast-1" });
    await destroySession();
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AccountDeletionError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof FederatedAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    throw error;
  }
}
