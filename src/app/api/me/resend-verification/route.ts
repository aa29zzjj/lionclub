import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { getSession } from "@/lib/session";
import { sendVerificationEmail } from "@/lib/email-verification";
import { getClientIp, consumeAuthLimits, rateLimitResponse } from "@/lib/rate-limit";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { getAuthAppOrigin } from "@/lib/auth-origin";

export async function POST(request: NextRequest) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (me.emailVerifiedAt) return NextResponse.json({ error: "此帳號已完成驗證" }, { status: 409 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const from = process.env.PASSWORD_RESET_FROM_EMAIL;
  if (!from) return NextResponse.json({ error: "驗證信件服務尚未完成設定" }, { status: 503 });

  const prisma = await getPrisma();
  const limited = await consumeAuthLimits(prisma, "resend-verification", getClientIp(request), session.userId);
  if (limited) return rateLimitResponse(limited);
  try {
    await sendVerificationEmail(prisma, { userId: session.userId, appOrigin: getAuthAppOrigin(request.nextUrl.origin) });
  } catch {
    console.error("Resend verification email failed");
    return NextResponse.json({ error: "驗證信暫時無法寄送，請稍後再試" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
