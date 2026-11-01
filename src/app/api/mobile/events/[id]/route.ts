import { NextRequest, NextResponse } from "next/server";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { readEventTags } from "@/lib/event-tags";
import { isPersonalEventHidden } from "@/lib/event-visibility";
import { canManageEvent, getEventPublishingOptions } from "@/lib/event-scope";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileMember(req);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });
  const { prisma, member: me } = auth;

  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      hostOrganization: { select: { name: true } },
      registrations: { where: { memberId: me.id, status: "REGISTERED" }, select: { id: true, checkedInAt: true } },
      _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
    },
  });

  if (!event || await isPersonalEventHidden(prisma, me.id, event)) return NextResponse.json({ error: "找不到此活動" }, { status: 404 });

  const officialHosts = await getEventPublishingOptions(prisma, me.id, me.organizationId, event.hostOrganizationId);
  const allowedScopes = officialHosts.map((option) => option.scope);
  const tagData = await readEventTags(prisma, [event.id]);

  return NextResponse.json({
    allowedScopes,
    officialHosts,
    tagsAvailable: tagData.tagsAvailable,
    event: {
      id: event.id,
      title: event.title,
      description: event.description ?? undefined,
      location: event.location ?? "",
      capacity: event.capacity ?? undefined,
      category: event.category,
      tags: tagData.byId.get(event.id) ?? [],
      scope: event.scope,
      coverPhotoUrl: event.coverPhotoUrl ?? undefined,
      hostChapter: event.hostOrganization.name,
      hostOrganizationId: event.hostOrganizationId,
      startAt: event.startAt,
      isRegistered: event.registrations.length > 0,
      isCheckedIn: event.registrations.some(registration => Boolean(registration.checkedInAt)),
      registeredCount: event._count.registrations,
      isFull: event.capacity !== null && event._count.registrations >= event.capacity,
      canManage: await canManageEvent(prisma, me.id, event),
      canConvertToPersonal: event.createdById === me.id,
    },
  });
}
