import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { isBlockedEitherWay } from "@/lib/member-block";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";

const bodySchema = z.object({ memberId: z.string().min(1) });

export async function POST(req: NextRequest) {
  if (!isTrustedBrowserMutation(req)) return NextResponse.json({ error: "請從網站操作" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少會員 id" }, { status: 400 });
  const { memberId } = parsed.data;
  if (memberId === me.id) return NextResponse.json({ error: "不能加自己為好友" }, { status: 400 });

  const prisma = await getPrisma();
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
