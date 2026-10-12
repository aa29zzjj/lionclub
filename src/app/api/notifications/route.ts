import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";

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
  memberIds: z.array(z.string().min(1)).min(1),
  message: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "欄位格式錯誤" }, { status: 400 });
  const { eventId, memberIds, message } = parsed.data;

  const prisma = await getPrisma();
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return NextResponse.json({ error: "找不到此活動" }, { status: 404 });

  const notification = await prisma.eventNotification.create({
    data: {
      eventId,
      senderId: me.id,
      message: message?.trim() || `邀請你一起參加「${event.title}」！`,
      recipients: { create: memberIds.map((recipientId) => ({ recipientId })) },
    },
  });

  return NextResponse.json({ ok: true, notificationId: notification.id });
}
