import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { memberId } = await params;
  if (memberId === me.id) return NextResponse.json({ error: "不能封鎖自己" }, { status: 400 });

  const prisma = await getPrisma();
  const target = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "找不到此會員" }, { status: 404 });

  await prisma.$transaction([
    prisma.memberBlock.upsert({
      where: { blockerId_blockedId: { blockerId: me.id, blockedId: memberId } },
      create: { blockerId: me.id, blockedId: memberId },
      update: {},
    }),
    prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: me.id, addresseeId: memberId },
          { requesterId: memberId, addresseeId: me.id },
        ],
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { memberId } = await params;
  const prisma = await getPrisma();
  await prisma.memberBlock.deleteMany({ where: { blockerId: me.id, blockedId: memberId } });

  return NextResponse.json({ ok: true });
}
