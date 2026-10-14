import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember, hasAdminRoleForOrganization } from "@/lib/current-member";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { EVENT_CATEGORIES } from "@/lib/event-category";
import { EVENT_SCOPES, EVENT_SCOPE_REQUIRED_ROLES } from "@/lib/event-scope";

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

  const scopeChecks = await Promise.all(
    EVENT_SCOPES.filter((scope) => scope !== "CLUB").map(async (scope) => ({
      scope,
      allowed: await hasAdminRoleForOrganization(me.id, me.organizationId, EVENT_SCOPE_REQUIRED_ROLES[scope]),
    }))
  );
  const allowedScopes = ["CLUB", ...scopeChecks.filter((r) => r.allowed).map((r) => r.scope)];

  return NextResponse.json({
    allowedScopes,
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
});

export async function POST(req: NextRequest) {
  if (!isTrustedBrowserMutation(req)) return NextResponse.json({ error: "請從網站操作" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });
  }
  const { title, startAt, location, capacity, description, coverPhotoUrl, category } = parsed.data;
  const effectiveCategory = category ?? "CLUB_OFFICIAL";
  const effectiveScope = effectiveCategory === "PERSONAL" ? "CLUB" : parsed.data.scope ?? "CLUB";

  if (effectiveScope !== "CLUB") {
    const allowed = await hasAdminRoleForOrganization(me.id, me.organizationId, EVENT_SCOPE_REQUIRED_ROLES[effectiveScope]);
    if (!allowed) return NextResponse.json({ error: "沒有發佈此範圍活動的管理權限" }, { status: 403 });
  }

  const prisma = await getPrisma();
  try {
    const event = await prisma.$transaction(async tx => {
      const actor = await tx.member.findFirst({ where: { id: me.id, status: "ACTIVE", deletedAt: null, organizationId: me.organizationId }, select: { id: true } });
      const club = await tx.organization.findFirst({ where: { id: me.organizationId, isActive: true }, select: { id: true } });
      if (!actor || !club) throw new Error("EVENT_IDENTITY_CHANGED");
      return tx.event.create({ data: {
      title,
      startAt: new Date(startAt),
      location,
      capacity,
      description,
      coverPhotoUrl: coverPhotoUrl || null,
      category: effectiveCategory,
      scope: effectiveScope,
      hostOrganizationId: me.organizationId,
      createdById: me.id,
      } });
    }, { isolationLevel: "Serializable" });

    return NextResponse.json({ ok: true, eventId: event.id });
  } catch (error) {
    if (error instanceof Error && error.message === "EVENT_IDENTITY_CHANGED") return NextResponse.json({ error: "會籍或帳號已更新，請重新登入確認" }, { status: 409 });
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") return NextResponse.json({ error: "帳號或活動同時更新，請重新載入後再試" }, { status: 409 });
    throw error;
  }
}
