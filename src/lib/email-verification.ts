import crypto from "crypto";
import type { PrismaClient } from "@prisma/client";
import { sendSesEmail } from "./aws-http";

export async function sendVerificationEmail(
  prisma: PrismaClient,
  input: { userId: string; email: string; name: string; appOrigin: string }
) {
  const from = process.env.PASSWORD_RESET_FROM_EMAIL;
  if (!from) return;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-northeast-1";

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { userId: input.userId, usedAt: null } }),
    prisma.emailVerificationToken.create({
      data: { userId: input.userId, tokenHash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    }),
  ]);

  const verifyUrl = new URL("/verify-email", `${input.appOrigin}/`);
  verifyUrl.searchParams.set("token", token);

  await sendSesEmail({
    region,
    from,
    to: input.email,
    subject: "獅子會 App 請驗證您的 Email",
    text: `${input.name} 您好，\n\n請在 24 小時內點擊以下連結驗證您的 Email：\n\n${verifyUrl.toString()}\n\n如果不是您本人註冊，請忽略此信。`,
  });
}
