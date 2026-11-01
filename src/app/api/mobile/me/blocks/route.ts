import { NextRequest, NextResponse } from "next/server";
import { requireMobileMember } from "@/lib/mobile-request-auth";

/** Only the current member's outgoing blocks; no other user's block choices leak. */
export async function GET(req: NextRequest) {
  const auth = await requireMobileMember(req);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });
  const rows = await auth.prisma.memberBlock.findMany({
    where: { blockerId: auth.member.id },
    include: { blocked: { select: { id: true, name: true, nickname: true, photoUrl: true, deletedAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ blocks: rows.filter((row) => !row.blocked.deletedAt).map((row) => ({
    member: { id: row.blocked.id, name: row.blocked.name, nickname: row.blocked.nickname, photoUrl: row.blocked.photoUrl },
    createdAt: row.createdAt,
  })) });
}
