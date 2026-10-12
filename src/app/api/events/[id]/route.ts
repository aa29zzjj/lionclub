import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember, hasAdminRoleForOrganization } from "@/lib/current-member";

const managementRoles = [
  "CLUB_OFFICER",
  "CLUB_PRESIDENT",
  "ZONE_ADMIN",
  "DISTRICT_ADMIN",
  "MULTIDISTRICT_ADMIN",
  "SUPER_ADMIN",
];

const updateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  startAt: z.string().datetime(),
  location: z.string().trim().min(1).max(240),
  capacity: z.number().int().positive().nullable().optional(),
  description: z.string().trim().max(3000).nullable().optional(),
  coverPhotoUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
});

async function canManage(memberId: string, event: { createdById: string; hostOrganizationId: string }) {
  return (
    event.createdById === memberId ||
    hasAdminRoleForOrganization(memberId, event.hostOrganizationId, managementRoles)
  );
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
      registrations: { where: { memberId: me.id }, select: { id: true } },
      _count: { select: { registrations: true } },
    },
  });

  if (!event) return NextResponse.json({ error: "找不到此活動" }, { status: 404 });

  return NextResponse.json({
    event: {
      id: event.id,
      title: event.title,
      description: event.description ?? undefined,
      location: event.location ?? "",
      capacity: event.capacity ?? undefined,
      coverPhotoUrl: event.coverPhotoUrl ?? undefined,
      hostChapter: event.hostOrganization.name,
      startAt: event.startAt,
      isRegistered: event.registrations.length > 0,
      registeredCount: event._count.registrations,
      isFull: event.capacity !== null && event._count.registrations >= event.capacity,
      canManage: await canManage(me.id, event),
    },
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });

  const { id } = await params;
  const prisma = await getPrisma();
  const event = await prisma.event.findUnique({ where: { id }, include: { _count: { select: { registrations: true } } } });
  if (!event) return NextResponse.json({ error: "找不到此活動" }, { status: 404 });
  if (!(await canManage(me.id, event))) return NextResponse.json({ error: "沒有活動管理權限" }, { status: 403 });
  if (parsed.data.capacity !== null && parsed.data.capacity !== undefined && parsed.data.capacity < event._count.registrations) {
    return NextResponse.json({ error: `名額不能低於目前已報名的 ${event._count.registrations} 人` }, { status: 409 });
  }

  await prisma.event.update({
    where: { id },
    data: {
      title: parsed.data.title,
      startAt: new Date(parsed.data.startAt),
      location: parsed.data.location,
      capacity: parsed.data.capacity ?? null,
      description: parsed.data.description || null,
      ...(parsed.data.coverPhotoUrl !== undefined ? { coverPhotoUrl: parsed.data.coverPhotoUrl || null } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const prisma = await getPrisma();
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "找不到此活動" }, { status: 404 });
  if (!(await canManage(me.id, event))) return NextResponse.json({ error: "沒有活動管理權限" }, { status: 403 });

  await prisma.event.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
