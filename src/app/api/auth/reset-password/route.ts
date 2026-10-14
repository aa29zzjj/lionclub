import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { completePasswordReset, PasswordResetError } from "@/lib/password-reset";
import { consumeAuthLimits, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { destroySession } from "@/lib/session";

const bodySchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8, "密碼至少需要 8 個字元")
    .refine((value) => new TextEncoder().encode(value).length <= 72, "密碼最多 72 位元組"),
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });

  const prisma = await getPrisma();
  const limited = await consumeAuthLimits(prisma, "reset-password", getClientIp(request), parsed.data.token);
  if (limited) return rateLimitResponse(limited);

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  try {
    await completePasswordReset(prisma, parsed.data.token, passwordHash);
    await destroySession();
  } catch (error) {
    if (error instanceof PasswordResetError) {
      return NextResponse.json({ error: "重設連結無效或已過期，請重新申請" }, { status: 400 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
