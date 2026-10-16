import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { EVENT_CATEGORIES } from "@/lib/event-category";
import { EVENT_SCOPES, EventScopeError, canManageEvent, getEventPublishingOptions, resolveEventPublication } from "@/lib/event-scope";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  startAt: z.string().datetime(),
  location: z.string().trim().min(1).max(240),
  capacity: z.number().int().positive().nullable().optional(),
  description: z.string().trim().max(3000).nullable().optional(),
  coverPhotoUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  scope: z.enum(EVENT_SCOPES).optional(),
  hostOrganizationId: z.string().trim().min(1).max(200).optional(),
});

class EventMutationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function mutationErrorResponse(error: unknown) {
  if (error instanceof EventMutationError || error instanceof EventScopeError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error && typeof error === "object" && "code" in error && ["P2034", "P2003"].includes(String(error.code))) {
    return NextResponse.json({ error: "活動、報名或報到資料同時更新，請重新載入確認後再操作。" }, { status: 409 });
  }
  throw error;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const prisma = await getPrisma();
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      hostOrganization: { select: { name: true } },
      registrations: { where: { memberId: me.id, status: "REGISTERED" }, select: { id: true, checkedInAt: true } },
      _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
    },
  });

  if (!event) return NextResponse.json({ error: "找不到此活動" }, { status: 404 });

  const officialHosts = await getEventPublishingOptions(prisma, me.id, me.organizationId, event.hostOrganizationId);
  const allowedScopes = officialHosts.map((option) => option.scope);

  return NextResponse.json({
    allowedScopes,
    officialHosts,
    event: {
      id: event.id,
      title: event.title,
      description: event.description ?? undefined,
      location: event.location ?? "",
      capacity: event.capacity ?? undefined,
      category: event.category,
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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站管理活動" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });

  const { id } = await params;
  const prisma = await getPrisma();
  try {
    const publication = await prisma.$transaction(async tx => {
      const actor = await tx.member.findFirst({ where: { id: me.id, status: "ACTIVE", deletedAt: null }, select: { id: true } });
      if (!actor) throw new EventMutationError(409, "帳號已更新，請重新登入確認");
      const event = await tx.event.findUnique({ where: { id }, include: { _count: { select: { registrations: { where: { status: "REGISTERED" } } } } } });
      if (!event) throw new EventMutationError(404, "找不到此活動");
      if (!(await canManageEvent(tx, me.id, event))) throw new EventMutationError(403, "沒有活動管理權限，官方活動須持有有效且對應範圍的管理角色");
      if (parsed.data.capacity != null && parsed.data.capacity < event._count.registrations) throw new EventMutationError(409, `名額不能低於目前已報名的 ${event._count.registrations} 人`);
      const nextCategory = parsed.data.category ?? event.category;
      const nextScope = parsed.data.scope ?? (nextCategory === "PERSONAL" ? "CLUB" : event.scope);
      if (nextCategory === "PERSONAL" && nextCategory !== event.category && event.createdById !== me.id) throw new EventMutationError(403, "僅原發布人可將官方活動改為其個人活動");
      const publication = await resolveEventPublication(tx, me.id, me.organizationId, {
        category: nextCategory, scope: nextScope,
        hostOrganizationId: parsed.data.hostOrganizationId ?? (nextCategory === "CLUB_OFFICIAL" && nextScope === event.scope ? event.hostOrganizationId : undefined),
      });
      await tx.event.update({ where: { id }, data: {
        title: parsed.data.title, startAt: new Date(parsed.data.startAt), location: parsed.data.location,
        capacity: parsed.data.capacity ?? null, description: parsed.data.description || null,
        ...(parsed.data.coverPhotoUrl !== undefined ? { coverPhotoUrl: parsed.data.coverPhotoUrl || null } : {}),
        ...publication,
      } });
      const host = await tx.organization.findUnique({ where: { id: publication.hostOrganizationId }, select: { name: true } });
      return { ...publication, hostChapter: host?.name ?? "" };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ok: true, ...publication });
  } catch (error) { return mutationErrorResponse(error); }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedBrowserMutation(_request)) return NextResponse.json({ error: "請從網站管理活動" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const prisma = await getPrisma();
  try {
    await prisma.$transaction(async tx => {
      const actor = await tx.member.findFirst({ where: { id: me.id, status: "ACTIVE", deletedAt: null }, select: { id: true } });
      if (!actor) throw new EventMutationError(409, "帳號已更新，請重新登入確認");
      const event = await tx.event.findUnique({ where: { id } });
      if (!event) throw new EventMutationError(404, "找不到此活動");
      if (!(await canManageEvent(tx, me.id, event))) throw new EventMutationError(403, "沒有活動管理權限");
      if (await tx.eventRegistration.count({ where: { eventId: id, checkedInAt: { not: null } } })) throw new EventMutationError(409, "活動已有簽到紀錄，請保留歷史；不可直接刪除活動。");
      await tx.event.delete({ where: { id } });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ok: true });
  } catch (error) { return mutationErrorResponse(error); }
}
