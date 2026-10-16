import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";
import { attendanceCounts } from "@/lib/event-attendance";
import { canManageEvent } from "@/lib/event-scope";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const prisma = await getPrisma();
  const event = await prisma.event.findUnique({
    where: { id },
    select: { createdById: true, hostOrganizationId: true, category: true, scope: true },
  });
  if (!event) return NextResponse.json({ error: "找不到此活動" }, { status: 404 });

  const canManage = await canManageEvent(prisma, me.id, event);
  if (!canManage) return NextResponse.json({ error: "沒有權限查看報名者資料" }, { status: 403 });

  const registrations = await prisma.eventRegistration.findMany({
    where: { eventId: id, status: "REGISTERED" },
    orderBy: { registeredAt: "asc" },
    select: {
      id: true,
      registeredAt: true,
      checkedInAt: true,
      checkInAudit: { select: { method: true, reason: true, checkedInAt: true, actor: { select: { id: true, name: true } } } },
      member: {
        select: {
          id: true,
          name: true,
          nickname: true,
          email: true,
          phone: true,
          title: true,
          photoUrl: true,
          organization: { select: { name: true } },
        },
      },
    },
  });

  const checkInAudits = await prisma.eventCheckInAudit.findMany({ where: { eventId: id }, select: { id: true, registrationId: true, method: true, reason: true, checkedInAt: true, actor: { select: { id: true, name: true } } }, orderBy: { checkedInAt: "asc" } });
  return NextResponse.json({ registrations, checkInAudits, ...await attendanceCounts(prisma, id) }, { headers: { "Cache-Control": "no-store" } });
}
