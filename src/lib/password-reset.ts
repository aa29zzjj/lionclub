import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { sendSesEmail } from "./aws-http";
import { isProductionDemoUser } from "./auth-session";

export class PasswordResetError extends Error {}
const normalized = (email: string) => email.trim().toLowerCase();
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** Re-read the identity while issuing; a stale address lookup cannot issue for a new address. */
export async function sendPasswordResetEmail(prisma: PrismaClient,
  input: { userId: string; requestedEmail: string; appOrigin: string },
  options: { from?: string; region?: string; sender?: typeof sendSesEmail; now?: Date; token?: string; production?: boolean } = {},
) {
  const from = options.from ?? process.env.PASSWORD_RESET_FROM_EMAIL;
  if (!from) throw new Error("PASSWORD_RESET_EMAIL_UNCONFIGURED");
  const now = options.now ?? new Date();
  const token = options.token ?? crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const recipient = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: input.userId }, include: { member: true } });
    if (!user || normalized(user.email) !== normalized(input.requestedEmail) || isProductionDemoUser(user, options.production)) return null;
    const email = normalized(user.email);
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await tx.passwordResetToken.create({ data: { userId: user.id, email, tokenHash, expiresAt: new Date(now.getTime() + 30 * 60 * 1000) } });
    return email;
  }, { isolationLevel: "Serializable" });
  if (!recipient) return { sent: false };
  const resetUrl = new URL("/reset-password", `${input.appOrigin.replace(/\/$/, "")}/`);
  resetUrl.searchParams.set("token", token);
  try {
    await (options.sender ?? sendSesEmail)({
      region: options.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "ap-northeast-1",
      from, to: recipient, subject: "獅子會 App 密碼重設",
      text: `請在 30 分鐘內開啟以下連結重設密碼：\n\n${resetUrl}\n\n如果不是你提出申請，請忽略此信。`,
    });
  } catch (error) {
    await prisma.passwordResetToken.deleteMany({ where: { tokenHash, usedAt: null } });
    throw error;
  }
  return { sent: true };
}

export async function completePasswordReset(prisma: PrismaClient, token: string, passwordHash: string, now = new Date()) {
  try {
    await prisma.$transaction(async (tx) => {
      const record = await tx.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
      if (!record?.email || record.usedAt || record.expiresAt <= now) throw new PasswordResetError("RESET_TOKEN_INVALID");
      const user = await tx.user.findUnique({ where: { id: record.userId }, include: { member: true } });
      if (!user || normalized(user.email) !== normalized(record.email) || isProductionDemoUser(user)) throw new PasswordResetError("RESET_TOKEN_INVALID");
      const claimed = await tx.passwordResetToken.updateMany({ where: { id: record.id, email: record.email, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (claimed.count !== 1) throw new PasswordResetError("RESET_TOKEN_INVALID");
      const changed = await tx.user.updateMany({ where: { id: record.userId, email: { equals: record.email, mode: "insensitive" }, sessionVersion: user.sessionVersion }, data: { passwordHash, sessionVersion: { increment: 1 } } });
      if (changed.count !== 1) throw new PasswordResetError("RESET_TOKEN_INVALID");
      await tx.passwordResetToken.deleteMany({ where: { userId: record.userId, id: { not: record.id }, usedAt: null } });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") throw new PasswordResetError("RESET_TOKEN_INVALID");
    throw error;
  }
}
