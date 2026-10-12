import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";

export async function GET(req: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ members: [] });

  const prisma = await getPrisma();
  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: me.id }, { addresseeId: me.id }] },
  });
  const connectedIds = new Set(friendships.map((f) => (f.requesterId === me.id ? f.addresseeId : f.requesterId)));

  const members = await prisma.member.findMany({
    where: {
      id: { notIn: [me.id, ...connectedIds] },
      status: "ACTIVE",
      name: { contains: q },
    },
    include: { organization: true },
    take: 20,
  });

  return NextResponse.json({
    members: members.map((m) => ({ id: m.id, name: m.name, chapter: m.organization.name, title: m.title ?? undefined })),
  });
}
