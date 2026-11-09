import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { isBlockedEitherWay } from "@/lib/member-block";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { enqueueMobilePush } from "@/lib/mobile-push";
import { resolveMobilePushSettings } from "@/lib/mobile-push-runtime";

const bodySchema = z.object({ memberId: z.string().min(1) });
class FriendRequestError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function POST(req: NextRequest) {
  if (!isTrustedBrowserMutation(req)) return NextResponse.json({ error: "請從網站操作" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少會員 id" }, { status: 400 });
  const { memberId } = parsed.data;
  if (memberId === me.id) return NextResponse.json({ error: "不能加自己為好友" }, { status: 400 });

  const prisma = await getPrisma();
  const pushSettings = await resolveMobilePushSettings();
  try {
    const friendship = await prisma.$transaction(async tx => {
      const members = await tx.member.findMany({ where: { id: { in: [me.id, memberId] }, status: "ACTIVE", deletedAt: null }, select: { id: true } });
      if (members.length !== 2) throw new FriendRequestError(404, "找不到此會員或帳號狀態已更新");
      if (await isBlockedEitherWay(tx, me.id, memberId)) throw new FriendRequestError(403, "無法送出好友邀請");
      const existing = await tx.friendship.findFirst({ where: { OR: [
        { requesterId: me.id, addresseeId: memberId },
        { requesterId: memberId, addresseeId: me.id },
      ] } });
      if (existing) throw new FriendRequestError(409, "已經是好友或邀請已送出");
      const created = await tx.friendship.create({ data: { requesterId: me.id, addresseeId: memberId, status: "PENDING", source: "SEARCH" } });
      // The invitation and its privacy-minimal push receipt commit together.
      // QR acceptance is a different flow and must not produce another invite.
      await enqueueMobilePush(tx, { kind: "friend_invitation", sourceId: created.id, actorId: me.id, recipientMemberIds: [memberId] }, pushSettings);
      return created;
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ok: true, friendshipId: friendship.id });
  } catch (error) {
    if (error instanceof FriendRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error && typeof error === "object" && "code" in error && ["P2002", "P2003", "P2025", "P2034"].includes(String(error.code))) return NextResponse.json({ error: "好友或帳號資料同時更新，請重新載入確認" }, { status: 409 });
    throw error;
  }
}
