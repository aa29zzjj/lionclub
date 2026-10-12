import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";

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
      hostChapter: event.hostOrganization.name,
      startAt: event.startAt,
      isRegistered: event.registrations.length > 0,
    },
  });
}
