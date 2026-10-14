import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { findUserByEmail } from "@/lib/user-email";
import { getClientIp, consumeAuthLimits, rateLimitResponse } from "@/lib/rate-limit";
import { isProductionDemoUser } from "@/lib/auth-session";
import { sendPasswordResetEmail } from "@/lib/password-reset";
import { getAuthAppOrigin } from "@/lib/auth-origin";

const bodySchema = z.object({ email: z.string().trim().email() });
const genericMessage = "如果此信箱已註冊，我們會寄出密碼重設連結。";

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請輸入有效的 Email" }, { status: 400 });

  const prisma = await getPrisma();
  const limited = await consumeAuthLimits(prisma, "forgot-password", getClientIp(request), parsed.data.email);
  if (limited) return rateLimitResponse(limited);
  const user = await findUserByEmail(prisma, parsed.data.email);
  if (!user || isProductionDemoUser(user)) return NextResponse.json({ ok: true, message: genericMessage });

  const from = process.env.PASSWORD_RESET_FROM_EMAIL;
  if (!from) return NextResponse.json({ error: "密碼重設信件服務尚未完成設定" }, { status: 503 });
  try {
    await sendPasswordResetEmail(prisma, { userId: user.id, requestedEmail: parsed.data.email, appOrigin: getAuthAppOrigin(request.nextUrl.origin) }, { from });
  } catch {
    console.error("Password reset email failed");
    return NextResponse.json({ error: "密碼重設信件暫時無法寄送，請稍後再試" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, message: genericMessage });
}
