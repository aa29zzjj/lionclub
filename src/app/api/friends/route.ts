import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { getBlockedMemberIds } from "@/lib/member-block";

function toCard(member: { id: string; name: string; nickname: string | null; title: string | null; photoUrl: string | null; organization: { name: string } }) {
  return {
    id: member.id,
    name: member.name,
    nickname: member.nickname ?? undefined,
    chapter: member.organization.name,
    title: member.title ?? undefined,
    photoUrl: member.photoUrl ?? undefined,
  };
}

export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const prisma = await getPrisma();
  const blocked = await getBlockedMemberIds(prisma, me.id);

  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [{ requesterId: me.id }, { addresseeId: me.id }],
      requesterId: { notIn: blocked }, addresseeId: { notIn: blocked },
      requester: { status: "ACTIVE", deletedAt: null }, addressee: { status: "ACTIVE", deletedAt: null },
    },
    include: {
      requester: { include: { organization: true } },
      addressee: { include: { organization: true } },
    },
  });

  const friends = friendships
    .filter((f) => f.status === "ACCEPTED")
    .map((f) => ({ ...toCard(f.requesterId === me.id ? f.addressee : f.requester), status: "friend" as const }));

  const incoming = friendships
    .filter((f) => f.status === "PENDING" && f.addresseeId === me.id)
    .map((f) => ({ ...toCard(f.requester), status: "pending-in" as const, friendshipId: f.id }));

  const outgoingPendingIds = new Set(
    friendships.filter((f) => f.status === "PENDING" && f.requesterId === me.id).map((f) => f.addresseeId)
  );
  const connectedIds = new Set(friendships.map((f) => (f.requesterId === me.id ? f.addresseeId : f.requesterId)));

  const suggestionMembers = await prisma.member.findMany({
    where: {
      id: { notIn: [me.id, ...connectedIds, ...blocked] },
      status: "ACTIVE",
      deletedAt: null,
    },
    include: { organization: true },
    take: 10,
    orderBy: { createdAt: "desc" },
  });

  const suggestions = suggestionMembers.map((m) => ({
    ...toCard(m),
    status: outgoingPendingIds.has(m.id) ? ("pending-out" as const) : ("none" as const),
  }));

  return NextResponse.json({ friends, incoming, suggestions });
}
