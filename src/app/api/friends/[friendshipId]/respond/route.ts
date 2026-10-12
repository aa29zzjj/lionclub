import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";

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

  const updated = await prisma.friendship.update({
    where: { id: friendshipId },
    data: { status: parsed.data.action === "accept" ? "ACCEPTED" : "BLOCKED", respondedAt: new Date() },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
