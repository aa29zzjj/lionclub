import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getPrisma } from "@/lib/prisma";
import { sendSesEmail } from "@/lib/aws-http";
import { createSession } from "@/lib/session";
import { centralRegistrationSchema, createCentralMember } from "@/lib/central-onboarding";
import { onboardingErrorResponse } from "@/lib/onboarding-response";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { getClientIp, consumeAuthLimits, rateLimitResponse } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/email-verification";
import { getAuthAppOrigin } from "@/lib/auth-origin";

export async function POST(req: NextRequest) {
  if (!isTrustedBrowserMutation(req)) return NextResponse.json({ error: "請從網站操作註冊" }, { status: 403 });
  const parsed = centralRegistrationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });
  if (!parsed.data.token) return NextResponse.json({ error: "請掃描共同邀請 QR Code 開啟註冊頁面" }, { status: 400 });
  try {
    const prisma = await getPrisma();
    const limited = await consumeAuthLimits(prisma, "register", getClientIp(req), parsed.data.email, parsed.data.token);
    if (limited) return rateLimitResponse(limited);
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const { member, user, organization } = await createCentralMember(prisma, parsed.data, passwordHash);
    await createSession({ userId: user.id, memberId: member.id, email: user.email, sessionVersion: user.sessionVersion });
    const from = process.env.PASSWORD_RESET_FROM_EMAIL;
    if (from) {
      // Awaited (not fire-and-forget): the serverless runtime can freeze/terminate
      // right after the response is sent, which would silently drop un-awaited sends.
      await sendSesEmail({
        region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-northeast-1",
        from, to: user.email, subject: "獅子會 App 註冊完成，可以開始使用",
        text: `${member.name} 您好，\n\n您的平台帳號已開通，可以立即使用。目前統一暫存於「${organization.name}」，正式分會將由授權管理者依名單核對後分派；此安排不代表正式獅子會會籍已被驗證。\n\n如果不是您本人註冊，請聯絡服務管理者。`,
      }).catch(() => console.error("Registration welcome email failed"));
      try { await sendVerificationEmail(prisma, { userId: user.id, appOrigin: getAuthAppOrigin(req.nextUrl.origin) }); }
      catch { console.error("Verification email failed"); }
    }
    return NextResponse.json({ ok: true, memberId: member.id, organizationName: organization.name,
      organizationAssignmentStatus: "NEEDS_ASSIGNMENT", canLogin: true });
  } catch (error) { return onboardingErrorResponse(error); }
}
