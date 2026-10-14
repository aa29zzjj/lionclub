import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";

/** Only the current member's outgoing blocks; no other user's block choices leak. */
export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const prisma = await getPrisma();
  const rows = await prisma.memberBlock.findMany({
    where: { blockerId: me.id },
    include: { blocked: { select: { id: true, name: true, nickname: true, photoUrl: true, deletedAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ blocks: rows.filter((row) => !row.blocked.deletedAt).map((row) => ({
    member: { id: row.blocked.id, name: row.blocked.name, nickname: row.blocked.nickname, photoUrl: row.blocked.photoUrl },
    createdAt: row.createdAt,
  })) });
}
