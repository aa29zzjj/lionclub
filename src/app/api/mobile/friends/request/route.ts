import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { isBlockedEitherWay } from "@/lib/member-block";

const bodySchema = z.object({ memberId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const auth = await requireMobileMember(req);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });
  const { prisma, member: me } = auth;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少會員 id" }, { status: 400 });
  const { memberId } = parsed.data;
  if (memberId === me.id) return NextResponse.json({ error: "不能加自己為好友" }, { status: 400 });

  if (await isBlockedEitherWay(prisma, me.id, memberId)) {
    return NextResponse.json({ error: "無法送出好友邀請" }, { status: 403 });
  }
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: me.id, addresseeId: memberId },
        { requesterId: memberId, addresseeId: me.id },
      ],
    },
  });
  if (existing) return NextResponse.json({ error: "已經是好友或邀請已送出" }, { status: 409 });

  const friendship = await prisma.friendship.create({
    data: { requesterId: me.id, addresseeId: memberId, status: "PENDING", source: "SEARCH" },
  });

  return NextResponse.json({ ok: true, friendshipId: friendship.id });
}
