import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { getSession, destroySession } from "@/lib/session";
import { AccountDeletionError, anonymizeAccount } from "@/lib/account-deletion";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const bodySchema = z.object({ password: z.string().min(1) });

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

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "密碼不正確" }, { status: 401 });

  try {
    const result = await anonymizeAccount(prisma, { memberId: me.id, userId: user.id, expectedPasswordHash: user.passwordHash,
      bucket: process.env.AVATAR_BUCKET_NAME, region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-northeast-1" });
    await destroySession();
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AccountDeletionError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
