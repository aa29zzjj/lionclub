import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { isBlockedEitherWay } from "@/lib/member-block";

const bodySchema = z.object({ memberId: z.string().min(1) });

// 掃描對方會員證 QR Code 加好友：QR 內容就是對方的會員 id，
// 雙方當面掃描視同雙方同意，直接建立 ACCEPTED 好友關係。
export async function POST(req: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少會員 id" }, { status: 400 });
  const { memberId } = parsed.data;
  if (memberId === me.id) return NextResponse.json({ error: "不能加自己為好友" }, { status: 400 });

  const prisma = await getPrisma();
  const target = await prisma.member.findUnique({ where: { id: memberId }, include: { organization: true } });
  if (!target) return NextResponse.json({ error: "找不到此會員" }, { status: 404 });
  if (await isBlockedEitherWay(prisma, me.id, memberId)) {
    return NextResponse.json({ error: "無法加此會員為好友" }, { status: 403 });
  }

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: me.id, addresseeId: memberId },
        { requesterId: memberId, addresseeId: me.id },
      ],
    },
  });

  if (existing) {
    if (existing.status !== "ACCEPTED") {
      await prisma.friendship.update({ where: { id: existing.id }, data: { status: "ACCEPTED", respondedAt: new Date() } });
    }
  } else {
    await prisma.friendship.create({
      data: { requesterId: me.id, addresseeId: memberId, status: "ACCEPTED", source: "QR_SCAN", respondedAt: new Date() },
    });
  }

  return NextResponse.json({
    ok: true,
    friend: { id: target.id, name: target.name, chapter: target.organization.name, title: target.title ?? undefined },
  });
}
