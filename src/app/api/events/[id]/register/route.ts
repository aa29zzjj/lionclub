import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";

// 切換目前會員的報名狀態：已報名就取消，未報名就報名
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const prisma = await getPrisma();

  const existing = await prisma.eventRegistration.findUnique({
    where: { eventId_memberId: { eventId: id, memberId: me.id } },
  });

  if (existing) {
    await prisma.eventRegistration.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true, registered: false });
  }

  await prisma.eventRegistration.create({ data: { eventId: id, memberId: me.id } });
  return NextResponse.json({ ok: true, registered: true });
}
