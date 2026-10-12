import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";

export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const prisma = await getPrisma();
  const events = await prisma.event.findMany({
    include: {
      hostOrganization: { select: { name: true } },
      registrations: { where: { memberId: me.id }, select: { id: true } },
      _count: { select: { registrations: true } },
    },
    orderBy: { startAt: "asc" },
  });

  return NextResponse.json({
    events: events.map((ev) => ({
      id: ev.id,
      title: ev.title,
      description: ev.description ?? undefined,
      location: ev.location ?? "",
      capacity: ev.capacity ?? undefined,
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
  title: z.string().min(1),
  startAt: z.string().min(1),
  location: z.string().min(1),
  capacity: z.number().int().positive().optional(),
  description: z.string().optional(),
  coverPhotoUrl: z.union([z.string().url(), z.literal("")]).optional(),
});

export async function POST(req: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });
  }
  const { title, startAt, location, capacity, description, coverPhotoUrl } = parsed.data;

  const prisma = await getPrisma();
  const event = await prisma.event.create({
    data: {
      title,
      startAt: new Date(startAt),
      location,
      capacity,
      description,
      coverPhotoUrl: coverPhotoUrl || null,
      hostOrganizationId: me.organizationId,
      createdById: me.id,
    },
  });

  return NextResponse.json({ ok: true, eventId: event.id });
}
