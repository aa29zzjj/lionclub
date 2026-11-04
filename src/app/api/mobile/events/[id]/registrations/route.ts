import { NextRequest, NextResponse } from "next/server";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { attendanceCounts } from "@/lib/event-attendance";
import { canManageEvent } from "@/lib/event-scope";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileMember(request);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });
  const { prisma, member: me } = auth;

  const { id } = await params;
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

  return NextResponse.json({ registrations, ...await attendanceCounts(prisma, id) }, { headers: { "Cache-Control": "no-store" } });
}
