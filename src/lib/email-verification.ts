import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { sendSesEmail } from "./aws-http";

export class EmailVerificationError extends Error {}
const normalized = (email: string) => email.trim().toLowerCase();
export const verificationHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** Input email/name are legacy hints only; the database owns the recipient. */
export async function sendVerificationEmail(prisma: PrismaClient,
  input: { userId: string; email?: string; name?: string; appOrigin: string },
  options: { from?: string; region?: string; sender?: typeof sendSesEmail; now?: Date; token?: string } = {},
) {
  const from = options.from ?? process.env.PASSWORD_RESET_FROM_EMAIL;
  if (!from) return { sent: false };
  const now = options.now ?? new Date();
  const token = options.token ?? crypto.randomBytes(32).toString("base64url");
  const tokenHash = verificationHash(token);
  const recipient = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: input.userId }, include: { member: true } });
    if (!user?.member || user.member.status !== "ACTIVE") throw new EmailVerificationError("EMAIL_IDENTITY_INVALID");
    if (user.member.emailVerifiedAt) return null;
    const email = normalized(user.email);
    if (!email || !user.member.email || normalized(user.member.email) !== email) throw new EmailVerificationError("EMAIL_IDENTITY_INVALID");
    await tx.emailVerificationToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await tx.emailVerificationToken.create({ data: { userId: user.id, email, tokenHash, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) } });
    return { email, name: user.member.name };
  }, { isolationLevel: "Serializable" });
  if (!recipient) return { sent: false, alreadyVerified: true };
  const verifyUrl = new URL("/verify-email", `${input.appOrigin.replace(/\/$/, "")}/`);
  verifyUrl.searchParams.set("token", token);
  try {
    await (options.sender ?? sendSesEmail)({
      region: options.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "ap-northeast-1",
      from, to: recipient.email, subject: "獅子會 App 請驗證您的 Email",
      text: `${recipient.name} 您好，\n\n請在 24 小時內點擊以下連結驗證您的 Email：\n\n${verifyUrl}\n\n如果不是您本人提出申請，請忽略此信。`,
    });
  } catch (error) {
    await prisma.emailVerificationToken.deleteMany({ where: { tokenHash, usedAt: null } });
    throw error;
  }
  return { sent: true };
}

/** Claim and verification are one transaction, guarded by both current email copies. */
export async function consumeEmailVerification(prisma: PrismaClient, token: string, now = new Date()) {
  try {
    await prisma.$transaction(async (tx) => {
      const record = await tx.emailVerificationToken.findUnique({ where: { tokenHash: verificationHash(token) } });
      if (!record?.email || record.usedAt || record.expiresAt <= now) throw new EmailVerificationError("EMAIL_TOKEN_INVALID");
      const user = await tx.user.findUnique({ where: { id: record.userId } });
      if (!user?.memberId || normalized(user.email) !== normalized(record.email)) throw new EmailVerificationError("EMAIL_TOKEN_INVALID");
      const claimed = await tx.emailVerificationToken.updateMany({ where: { id: record.id, email: record.email, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (claimed.count !== 1) throw new EmailVerificationError("EMAIL_TOKEN_INVALID");
      const member = await tx.member.updateMany({ where: { id: user.memberId, email: { equals: record.email, mode: "insensitive" }, status: "ACTIVE" }, data: { emailVerifiedAt: now } });
      if (member.count !== 1) throw new EmailVerificationError("EMAIL_TOKEN_INVALID");
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") throw new EmailVerificationError("EMAIL_TOKEN_INVALID");
    throw error;
  }
}
