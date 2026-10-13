import crypto from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";

const bodySchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8, "密碼至少需要 8 個字元")
    .refine((value) => new TextEncoder().encode(value).length <= 72, "密碼最多 72 位元組"),
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });

  const tokenHash = crypto.createHash("sha256").update(parsed.data.token).digest("hex");
  const prisma = await getPrisma();
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
    return NextResponse.json({ error: "重設連結無效或已過期，請重新申請" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  try {
    await prisma.$transaction(async (transaction) => {
      const claimed = await transaction.passwordResetToken.updateMany({
        where: { id: resetToken.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("RESET_TOKEN_ALREADY_USED");
      await transaction.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
      await transaction.passwordResetToken.deleteMany({
        where: { userId: resetToken.userId, id: { not: resetToken.id }, usedAt: null },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "RESET_TOKEN_ALREADY_USED") {
      return NextResponse.json({ error: "重設連結無效或已過期，請重新申請" }, { status: 400 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
