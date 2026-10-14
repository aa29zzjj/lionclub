import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { hasAdminRoleForOrganization } from "@/lib/current-member";
import { getBlockedMemberIds } from "@/lib/member-block";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";

export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const prisma = await getPrisma();
  const blocked = await getBlockedMemberIds(prisma, me.id);
  const [notifications, received, unreadCount] = await Promise.all([prisma.eventNotification.findMany({
    where: { senderId: me.id },
    include: {
      event: { select: { title: true } },
      recipients: { include: { recipient: { select: { name: true } } } },
    },
    orderBy: { sentAt: "desc" },
  }), prisma.eventNotificationRecipient.findMany({
    where: { recipientId: me.id, notification: { senderId: { notIn: blocked } } },
    include: { notification: { include: {
      event: { select: { id: true, title: true } },
      sender: { select: { id: true, name: true, nickname: true } },
    } } },
    orderBy: { notification: { sentAt: "desc" } },
    take: 100,
  }), prisma.eventNotificationRecipient.count({
    where: { recipientId: me.id, readAt: null, notification: { senderId: { notIn: blocked } } },
  })]);

  return NextResponse.json({
    inbox: received.map((row) => ({
      id: row.id, notificationId: row.notificationId, eventId: row.notification.event.id,
      eventTitle: row.notification.event.title, message: row.notification.message,
      sentAt: row.notification.sentAt, readAt: row.readAt, sender: row.notification.sender,
    })),
    unreadCount,
    notifications: notifications.map((n) => ({
      id: n.id,
      eventTitle: n.event.title,
      message: n.message,
      sentAt: n.sentAt,
      recipients: n.recipients.map((r) => r.recipient.name),
    })),
  });
}

const bodySchema = z.object({
  eventId: z.string().min(1),
  recipientType: z.enum(["selected", "organization"]).default("selected"),
  memberIds: z.array(z.string().min(1)).max(1000).default([]),
  message: z.string().max(1000).optional(),
});

const readSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) });

export async function PATCH(request: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作" }, { status: 403 });
  const parsed = readSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請選擇要標為已讀的通知" }, { status: 400 });
  const prisma = await getPrisma();
  const changed = await prisma.eventNotificationRecipient.updateMany({
    where: { recipientId: me.id, notificationId: { in: parsed.data.ids }, readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true, updatedCount: changed.count });
}

export async function POST(req: NextRequest) {
  if (!isTrustedBrowserMutation(req)) return NextResponse.json({ error: "請從網站操作" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "欄位格式錯誤" }, { status: 400 });
  const { eventId, recipientType, message } = parsed.data;

  const database = await getPrisma();
  try { return await database.$transaction(async prisma => {
  // Identity, permission, block/recipient checks and message creation must share
  // the deletion transaction boundary; a deleted sender cannot write PII back.
  if (!await prisma.member.findFirst({ where: { id: me.id, status: "ACTIVE", deletedAt: null } })) return NextResponse.json({ error: "帳號狀態已更新，請重新登入" }, { status: 409 });
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return NextResponse.json({ error: "找不到此活動" }, { status: 404 });

  let memberIds: string[];
  if (recipientType === "organization") {
    const canNotifyOrganization =
      event.createdById === me.id ||
      (await hasAdminRoleForOrganization(me.id, event.hostOrganizationId, [
        "CLUB_OFFICER",
        "CLUB_PRESIDENT",
        "ZONE_ADMIN",
        "DISTRICT_ADMIN",
        "MULTIDISTRICT_ADMIN",
        "SUPER_ADMIN",
      ], prisma));
    if (!canNotifyOrganization) {
      return NextResponse.json({ error: "只有活動建立者或幹部可以通知整個分會" }, { status: 403 });
    }
    const members = await prisma.member.findMany({
      where: { organizationId: event.hostOrganizationId, status: "ACTIVE", deletedAt: null, id: { not: me.id } },
      select: { id: true },
    });
    memberIds = members.map((member) => member.id);
  } else {
    const requestedIds = [...new Set(parsed.data.memberIds)].filter((id) => id !== me.id);
    if (requestedIds.length === 0) {
      return NextResponse.json({ error: "請至少選擇一位好友" }, { status: 400 });
    }
    const friendships = await prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [
          { requesterId: me.id, addresseeId: { in: requestedIds } },
          { addresseeId: me.id, requesterId: { in: requestedIds } },
        ],
      },
      select: { requesterId: true, addresseeId: true },
    });
    const allowed = new Set(
      friendships.map((friendship) =>
        friendship.requesterId === me.id ? friendship.addresseeId : friendship.requesterId
      )
    );
    memberIds = requestedIds.filter((id) => allowed.has(id));
    if (memberIds.length !== requestedIds.length) {
      return NextResponse.json({ error: "收件人包含尚未成為好友的會員" }, { status: 403 });
    }
  }

  const blocked = await getBlockedMemberIds(prisma, me.id);
  const beforeFiltering = memberIds.length;
  const recipients = await prisma.member.findMany({ where: { id: { in: memberIds, notIn: blocked }, status: "ACTIVE", deletedAt: null }, select: { id: true } });
  memberIds = recipients.map((member) => member.id);
  if (recipientType === "selected" && memberIds.length !== beforeFiltering) {
    return NextResponse.json({ error: "部分收件人目前無法接收邀請，請重新選擇" }, { status: 409 });
  }

  if (memberIds.length === 0) {
    return NextResponse.json({ error: "此範圍目前沒有可通知的會員" }, { status: 400 });
  }

  const notification = await prisma.eventNotification.create({
    data: {
      eventId,
      senderId: me.id,
      message: message?.trim() || `邀請你一起參加「${event.title}」！`,
      recipients: { create: memberIds.map((recipientId) => ({ recipientId })) },
    },
  });

  return NextResponse.json({ ok: true, notificationId: notification.id, recipientCount: memberIds.length });
  }, { isolationLevel: "Serializable" }); }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && ["P2034", "P2003"].includes(String(error.code))) return NextResponse.json({ error: "帳號、好友或活動資料同時更新，請重新載入後確認再發送" }, { status: 409 });
    throw error;
  }
}
