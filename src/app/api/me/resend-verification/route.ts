import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { getSession } from "@/lib/session";
import { sendVerificationEmail } from "@/lib/email-verification";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (me.emailVerifiedAt) return NextResponse.json({ error: "此帳號已完成驗證" }, { status: 409 });

  if (await isRateLimited(`resend-verification:${getClientIp(request)}`, 5)) {
    return NextResponse.json({ error: "嘗試次數過多，請稍後再試" }, { status: 429 });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const from = process.env.PASSWORD_RESET_FROM_EMAIL;
  if (!from) return NextResponse.json({ error: "驗證信件服務尚未完成設定" }, { status: 503 });

  const prisma = await getPrisma();
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, "");
  try {
    await sendVerificationEmail(prisma, { userId: session.userId, email: session.email, name: me.name, appOrigin });
  } catch (error) {
    console.error("Resend verification email failed", error);
    return NextResponse.json({ error: "驗證信暫時無法寄送，請稍後再試" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
