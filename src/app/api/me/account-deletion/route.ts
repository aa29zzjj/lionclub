import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { getSession, destroySession } from "@/lib/session";

const bodySchema = z.object({ password: z.string().min(1) });

export async function POST(request: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請輸入密碼確認" }, { status: 400 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const prisma = await getPrisma();
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: "找不到帳號" }, { status: 404 });

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "密碼不正確" }, { status: 401 });

  const activeRoleCount = await prisma.adminRole.count({ where: { memberId: me.id, validUntil: null } });
  if (activeRoleCount > 0) {
    return NextResponse.json(
      { error: "您目前持有幹部權限，請先請其他管理者撤銷後再刪除帳號" },
      { status: 409 }
    );
  }

  const upcomingEventCount = await prisma.event.count({ where: { createdById: me.id, startAt: { gte: new Date() } } });
  if (upcomingEventCount > 0) {
    return NextResponse.json(
      { error: "您有尚未開始的活動，請先刪除或請其他幹部接手該活動後再刪除帳號" },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.user.delete({ where: { id: user.id } }),
    prisma.member.delete({ where: { id: me.id } }),
  ]);
  await destroySession();

  return NextResponse.json({ ok: true });
}
