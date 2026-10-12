import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { hasAdminRoleForOrganization } from "@/lib/current-member";

export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const prisma = await getPrisma();
  const notifications = await prisma.eventNotification.findMany({
    where: { senderId: me.id },
    include: {
      event: { select: { title: true } },
      recipients: { include: { recipient: { select: { name: true } } } },
    },
    orderBy: { sentAt: "desc" },
  });

  return NextResponse.json({
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
  memberIds: z.array(z.string().min(1)).default([]),
  message: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "欄位格式錯誤" }, { status: 400 });
  const { eventId, recipientType, message } = parsed.data;

  const prisma = await getPrisma();
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return NextResponse.json({ error: "找不到此活動" }, { status: 404 });

  let memberIds: string[];
  if (recipientType === "organization") {
    const canNotifyOrganization =
      event.createdById === me.id ||
      (await hasAdminRoleForOrganization(me.id, me.organizationId, [
        "CLUB_OFFICER",
        "CLUB_PRESIDENT",
        "ZONE_ADMIN",
        "DISTRICT_ADMIN",
        "MULTIDISTRICT_ADMIN",
        "SUPER_ADMIN",
      ]));
    if (!canNotifyOrganization) {
      return NextResponse.json({ error: "只有活動建立者或幹部可以通知整個分會" }, { status: 403 });
    }
    const members = await prisma.member.findMany({
      where: { organizationId: me.organizationId, status: "ACTIVE", id: { not: me.id } },
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
}
