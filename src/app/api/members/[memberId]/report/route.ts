import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentMember } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

const bodySchema = z.object({
  reason: z.string().trim().min(2, "請簡述檢舉原因").max(200),
  details: z.string().trim().max(2000).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { memberId } = await params;
  if (memberId === me.id) return NextResponse.json({ error: "不能檢舉自己" }, { status: 400 });

  if (await isRateLimited(`report:${getClientIp(request)}`, 10)) {
    return NextResponse.json({ error: "嘗試次數過多，請稍後再試" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });

  const prisma = await getPrisma();
  const target = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "找不到此會員" }, { status: 404 });

  await prisma.memberReport.create({
    data: { reporterId: me.id, targetId: memberId, reason: parsed.data.reason, details: parsed.data.details || null },
  });

  return NextResponse.json({ ok: true });
}
