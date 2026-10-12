import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";

// 切換目前會員的報名狀態：已報名就取消，未報名就報名
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  const prisma = await getPrisma();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await prisma.$transaction(
        async (transaction) => {
          const existing = await transaction.eventRegistration.findUnique({
            where: { eventId_memberId: { eventId: id, memberId: me.id } },
          });
          if (existing) {
            await transaction.eventRegistration.delete({ where: { id: existing.id } });
            return { registered: false, full: false, found: true };
          }

          const event = await transaction.event.findUnique({
            where: { id },
            include: { _count: { select: { registrations: true } } },
          });
          if (!event) return { registered: false, full: false, found: false };
          if (event.capacity !== null && event._count.registrations >= event.capacity) {
            return { registered: false, full: true, found: true };
          }

          await transaction.eventRegistration.create({ data: { eventId: id, memberId: me.id } });
          return { registered: true, full: false, found: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      if (!result.found) return NextResponse.json({ error: "找不到此活動" }, { status: 404 });
      if (result.full) return NextResponse.json({ error: "活動名額已滿" }, { status: 409 });
      return NextResponse.json({ ok: true, registered: result.registered });
    } catch (error) {
      const shouldRetry = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!shouldRetry || attempt === 2) throw error;
    }
  }

  return NextResponse.json({ error: "報名狀態更新失敗，請再試一次" }, { status: 503 });
}
