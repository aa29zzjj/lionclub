import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { sendSesEmail } from "@/lib/aws-http";
import { findUserByEmail } from "@/lib/user-email";

const bodySchema = z.object({ email: z.string().trim().email() });
const genericMessage = "如果此信箱已註冊，我們會寄出密碼重設連結。";

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請輸入有效的 Email" }, { status: 400 });

  const prisma = await getPrisma();
  const user = await findUserByEmail(prisma, parsed.data.email);
  if (!user) return NextResponse.json({ ok: true, message: genericMessage });

  const from = process.env.PASSWORD_RESET_FROM_EMAIL;
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, "");
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-northeast-1";
  if (!from) return NextResponse.json({ error: "密碼重設信件服務尚未完成設定" }, { status: 503 });

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    }),
  ]);

  const resetUrl = new URL("/reset-password", `${appOrigin}/`);
  resetUrl.searchParams.set("token", token);
  try {
    await sendSesEmail({
      region,
      from,
      to: user.email,
      subject: "獅子會 App 密碼重設",
      text: `請在 30 分鐘內開啟以下連結重設密碼：\n\n${resetUrl.toString()}\n\n如果不是你提出申請，請忽略此信。`,
    });
  } catch (error) {
    console.error("Password reset email failed", error);
    await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
    return NextResponse.json({ error: "密碼重設信件暫時無法寄送，請稍後再試" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, message: genericMessage });
}
