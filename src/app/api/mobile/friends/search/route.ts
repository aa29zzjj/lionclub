import { NextRequest, NextResponse } from "next/server";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { getBlockedMemberIds } from "@/lib/member-block";

export async function GET(req: NextRequest) {
  const auth = await requireMobileMember(req);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });
  const { prisma, member: me } = auth;

  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ members: [] });

  const blocked = await getBlockedMemberIds(prisma, me.id);
  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: me.id }, { addresseeId: me.id }] },
  });
  const connectedIds = new Set(friendships.map((f) => (f.requesterId === me.id ? f.addresseeId : f.requesterId)));

  const members = await prisma.member.findMany({
    where: {
      id: { notIn: [me.id, ...connectedIds, ...blocked] },
      status: "ACTIVE",
      deletedAt: null,
      OR: [{ name: { contains: q, mode: "insensitive" } }, { nickname: { contains: q, mode: "insensitive" } }],
    },
    include: { organization: true },
    take: 20,
  });

  return NextResponse.json({
    members: members.map((m) => ({ id: m.id, name: m.name, nickname: m.nickname ?? undefined, chapter: m.organization.name, title: m.title ?? undefined })),
  });
}
