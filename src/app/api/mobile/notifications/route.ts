import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { getBlockedMemberIds } from "@/lib/member-block";
import { visibleEventsWhere } from "@/lib/event-visibility";

export async function GET(req: NextRequest) {
  const auth = await requireMobileMember(req);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });
  const { prisma, member: me } = auth;

  const blocked = await getBlockedMemberIds(prisma, me.id);
  const visibleEvent = await visibleEventsWhere(prisma, me.id);
  const receivedWhere = { recipientId: me.id, notification: { senderId: { notIn: blocked }, event: visibleEvent } };
  const [received, unreadCount, invitations] = await Promise.all([prisma.eventNotificationRecipient.findMany({
    where: receivedWhere,
    include: { notification: { include: {
      event: { select: { id: true, title: true } },
      sender: { select: { id: true, name: true, nickname: true } },
    } } },
    orderBy: { notification: { sentAt: "desc" } },
    take: 100,
  }), prisma.eventNotificationRecipient.count({
    where: { ...receivedWhere, readAt: null },
  }), prisma.friendship.findMany({
    where: { addresseeId: me.id, status: "PENDING", requesterId: { notIn: blocked }, requester: { status: "ACTIVE", deletedAt: null } },
    select: { id: true, createdAt: true, requester: { select: { id: true, name: true, nickname: true, photoUrl: true } } },
    orderBy: { createdAt: "desc" },
  })]);

  return NextResponse.json({
    inbox: received.map((row) => ({
      id: row.id, notificationId: row.notificationId, eventId: row.notification.event.id,
      eventTitle: row.notification.event.title, message: row.notification.message,
      sentAt: row.notification.sentAt, readAt: row.readAt, sender: row.notification.sender,
    })),
    unreadCount,
    friendInvitations: invitations.map(({ id, createdAt, requester }) => ({ friendshipId: id, createdAt, requester })),
    pendingFriendCount: invitations.length,
  });
}

const readSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) });

export async function PATCH(req: NextRequest) {
  const auth = await requireMobileMember(req);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });

  const parsed = readSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請選擇要標為已讀的通知" }, { status: 400 });
  const changed = await auth.prisma.eventNotificationRecipient.updateMany({
    where: { recipientId: auth.member.id, notificationId: { in: parsed.data.ids }, readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true, updatedCount: changed.count });
}
