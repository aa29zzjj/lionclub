import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { hasAcceptedCurrentTerms, termsRequiredResponse } from "@/lib/terms-gate";
import { EVENT_CATEGORIES } from "@/lib/event-category";
import { EVENT_SCOPES, EventScopeError, getEventPublishingOptions, resolveEventPublication } from "@/lib/event-scope";

export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const prisma = await getPrisma();
  const events = await prisma.event.findMany({
    include: {
      hostOrganization: { select: { name: true } },
      registrations: { where: { memberId: me.id, status: "REGISTERED" }, select: { id: true } },
      _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
    },
    orderBy: { startAt: "asc" },
  });

  const officialHosts = await getEventPublishingOptions(prisma, me.id, me.organizationId);
  const allowedScopes = officialHosts.map((option) => option.scope);

  return NextResponse.json({
    allowedScopes,
    officialHosts,
    events: events.map((ev) => ({
      id: ev.id,
      title: ev.title,
      description: ev.description ?? undefined,
      location: ev.location ?? "",
      capacity: ev.capacity ?? undefined,
      category: ev.category,
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

const bodySchema = z.object({
  title: z.string().trim().min(1).max(160),
  startAt: z.string().datetime(),
  location: z.string().trim().min(1).max(240),
  capacity: z.number().int().positive().optional(),
  description: z.string().trim().max(3000).optional(),
  coverPhotoUrl: z.union([z.string().url(), z.literal("")]).optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  scope: z.enum(EVENT_SCOPES).optional(),
  hostOrganizationId: z.string().trim().min(1).max(200).optional(),
});

export async function POST(req: NextRequest) {
  if (!isTrustedBrowserMutation(req)) return NextResponse.json({ error: "請從網站操作" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (!hasAcceptedCurrentTerms(me)) return termsRequiredResponse();

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });
  }
  const { title, startAt, location, capacity, description, coverPhotoUrl, category } = parsed.data;
  const effectiveCategory = category ?? "PERSONAL";
  const effectiveScope = parsed.data.scope ?? "CLUB";

  const prisma = await getPrisma();
  try {
    const event = await prisma.$transaction(async tx => {
      const publication = await resolveEventPublication(tx, me.id, me.organizationId, {
        category: effectiveCategory, scope: effectiveScope, hostOrganizationId: parsed.data.hostOrganizationId,
      });
      return tx.event.create({ data: {
      title,
      startAt: new Date(startAt),
      location,
      capacity,
      description,
      coverPhotoUrl: coverPhotoUrl || null,
      ...publication,
      createdById: me.id,
      } });
    }, { isolationLevel: "Serializable" });

    return NextResponse.json({ ok: true, eventId: event.id });
  } catch (error) {
    if (error instanceof EventScopeError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") return NextResponse.json({ error: "帳號或活動同時更新，請重新載入後再試" }, { status: 409 });
    throw error;
  }
}
