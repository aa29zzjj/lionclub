import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { isBlockedEitherWay } from "@/lib/member-block";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";

const bodySchema = z.object({ action: z.enum(["accept", "decline"]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ friendshipId: string }> }) {
  if (!isTrustedBrowserMutation(req)) return NextResponse.json({ error: "請從網站操作" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { friendshipId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少 action" }, { status: 400 });

  const prisma = await getPrisma();
  try { return await prisma.$transaction(async tx => {
  const actor = await tx.member.findFirst({ where: { id: me.id, status: "ACTIVE", deletedAt: null }, select: { id: true } });
  if (!actor) return NextResponse.json({ error: "帳號狀態已更新，請重新登入" }, { status: 409 });
  const friendship = await tx.friendship.findFirst({ where: { id: friendshipId, requester: { status: "ACTIVE", deletedAt: null } } });
  if (!friendship || friendship.addresseeId !== me.id || friendship.status !== "PENDING") {
    return NextResponse.json({ error: "找不到此邀請" }, { status: 404 });
  }
  if (await isBlockedEitherWay(tx, me.id, friendship.requesterId)) {
    return NextResponse.json({ error: "這個邀請已無法回覆" }, { status: 409 });
  }

  const status = parsed.data.action === "accept" ? "ACCEPTED" : "BLOCKED";
  const updated = await tx.friendship.updateMany({
    where: { id: friendshipId, status: "PENDING", addresseeId: me.id },
    data: { status, respondedAt: new Date() },
  });
  if (updated.count !== 1) return NextResponse.json({ error: "邀請已更新，請重新載入" }, { status: 409 });

  return NextResponse.json({ ok: true, status });
  }, { isolationLevel: "Serializable" }); }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && ["P2034", "P2003"].includes(String(error.code))) return NextResponse.json({ error: "邀請或封鎖狀態同時更新，請重新載入" }, { status: 409 });
    throw error;
  }
}
