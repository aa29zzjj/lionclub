import { NextResponse } from "next/server";
import { getCurrentMember, hasAdminRoleForOrganization } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";
import { attendanceCounts, EVENT_ATTENDANCE_ROLES } from "@/lib/event-attendance";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const prisma = await getPrisma();
  const event = await prisma.event.findUnique({
    where: { id },
    select: { createdById: true, hostOrganizationId: true },
  });
  if (!event) return NextResponse.json({ error: "找不到此活動" }, { status: 404 });

  const canManage =
    event.createdById === me.id ||
    (await hasAdminRoleForOrganization(me.id, event.hostOrganizationId, EVENT_ATTENDANCE_ROLES));
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
