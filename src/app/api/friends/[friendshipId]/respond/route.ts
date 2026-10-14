import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { isBlockedEitherWay } from "@/lib/member-block";

const bodySchema = z.object({ action: z.enum(["accept", "decline"]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ friendshipId: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { friendshipId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少 action" }, { status: 400 });

  const prisma = await getPrisma();
  const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
  if (!friendship || friendship.addresseeId !== me.id || friendship.status !== "PENDING") {
    return NextResponse.json({ error: "找不到此邀請" }, { status: 404 });
  }
  if (await isBlockedEitherWay(prisma, me.id, friendship.requesterId)) {
    return NextResponse.json({ error: "這個邀請已無法回覆" }, { status: 409 });
  }

  const status = parsed.data.action === "accept" ? "ACCEPTED" : "BLOCKED";
  const updated = await prisma.friendship.updateMany({
    where: { id: friendshipId, status: "PENDING", addresseeId: me.id },
    data: { status, respondedAt: new Date() },
  });
  if (updated.count !== 1) return NextResponse.json({ error: "邀請已更新，請重新載入" }, { status: 409 });

  return NextResponse.json({ ok: true, status });
}
