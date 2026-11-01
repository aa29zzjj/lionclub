import { NextRequest, NextResponse } from "next/server";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { readEventTags } from "@/lib/event-tags";
import { visibleEventsWhere } from "@/lib/event-visibility";
import { getEventPublishingOptions } from "@/lib/event-scope";

export async function GET(req: NextRequest) {
  const auth = await requireMobileMember(req);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });
  const { prisma, member: me } = auth;

  const events = await prisma.event.findMany({
    where: await visibleEventsWhere(prisma, me.id),
    include: {
      hostOrganization: { select: { name: true } },
      registrations: { where: { memberId: me.id, status: "REGISTERED" }, select: { id: true } },
      _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
    },
    orderBy: { startAt: "asc" },
  });

  const officialHosts = await getEventPublishingOptions(prisma, me.id, me.organizationId);
  const allowedScopes = officialHosts.map((option) => option.scope);
  const tagData = await readEventTags(prisma, events.map((event) => event.id));

  return NextResponse.json({
    allowedScopes,
    officialHosts,
    tagsAvailable: tagData.tagsAvailable,
    events: events.map((ev) => ({
      id: ev.id,
      title: ev.title,
      description: ev.description ?? undefined,
      location: ev.location ?? "",
      capacity: ev.capacity ?? undefined,
      category: ev.category,
      tags: tagData.byId.get(ev.id) ?? [],
      scope: ev.scope,
      coverPhotoUrl: ev.coverPhotoUrl ?? undefined,
      hostChapter: ev.hostOrganization.name,
      startAt: ev.startAt,
      registeredCount: ev._count.registrations,
      isRegistered: ev.registrations.length > 0,
      isFull: ev.capacity !== null && ev._count.registrations >= ev.capacity,
    })),
  });
}
