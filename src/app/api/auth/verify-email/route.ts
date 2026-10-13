import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";

const bodySchema = z.object({ token: z.string().trim().min(1) });

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少驗證碼" }, { status: 400 });

  const tokenHash = crypto.createHash("sha256").update(parsed.data.token).digest("hex");
  const prisma = await getPrisma();
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json({ error: "驗證連結不正確或已過期，請重新申請" }, { status: 400 });
  }
  if (!record.user.memberId) {
    return NextResponse.json({ error: "此帳號尚未綁定會員資料" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.member.update({ where: { id: record.user.memberId }, data: { emailVerifiedAt: new Date() } }),
  ]);

  return NextResponse.json({ ok: true });
}
