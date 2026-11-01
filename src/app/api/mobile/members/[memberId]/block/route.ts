import { NextRequest, NextResponse } from "next/server";
import { requireMobileMember } from "@/lib/mobile-request-auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const auth = await requireMobileMember(req);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });
  const { prisma, member: me } = auth;

  const { memberId } = await params;
  if (memberId === me.id) return NextResponse.json({ error: "不能封鎖自己" }, { status: 400 });

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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const auth = await requireMobileMember(req);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });
  const { prisma, member: me } = auth;

  const { memberId } = await params;
  await prisma.memberBlock.deleteMany({ where: { blockerId: me.id, blockedId: memberId } });

  return NextResponse.json({ ok: true });
}
