import { NextRequest, NextResponse } from "next/server";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { sendVerificationEmail } from "@/lib/email-verification";
import { getClientIp, consumeAuthLimits, rateLimitResponse } from "@/lib/rate-limit";
import { getAuthAppOrigin } from "@/lib/auth-origin";

export async function POST(request: NextRequest) {
  const auth = await requireMobileMember(request);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });
  if (auth.member.emailVerifiedAt) return NextResponse.json({ error: "此帳號已完成驗證" }, { status: 409 });

  const from = process.env.PASSWORD_RESET_FROM_EMAIL;
  if (!from) return NextResponse.json({ error: "驗證信件服務尚未完成設定" }, { status: 503 });

  const limited = await consumeAuthLimits(auth.prisma, "resend-verification", getClientIp(request), auth.session.userId);
  if (limited) return rateLimitResponse(limited);
  try {
    await sendVerificationEmail(auth.prisma, { userId: auth.session.userId, appOrigin: getAuthAppOrigin(request.nextUrl.origin) });
  } catch {
    console.error("Resend verification email failed");
    return NextResponse.json({ error: "驗證信暫時無法寄送，請稍後再試" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
