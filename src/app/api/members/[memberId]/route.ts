import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";
import { serializeExperience } from "@/lib/member-experience";

export async function GET(_req: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { memberId } = await params;
  const prisma = await getPrisma();

  if (memberId !== me.id) {
    const friendship = await prisma.friendship.findFirst({
      where: {
        status: "ACCEPTED",
        OR: [
          { requesterId: me.id, addresseeId: memberId },
          { requesterId: memberId, addresseeId: me.id },
        ],
      },
      select: { id: true },
    });
    if (!friendship) return NextResponse.json({ error: "只有好友可以查看此會員資料" }, { status: 403 });
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId, status: "ACTIVE" },
    include: {
      organization: { select: { id: true, name: true, districtCode: true } },
      tags: { select: { id: true, name: true, category: true } },
      experiences: {
        where: memberId === me.id ? undefined : { visibility: { in: ["public", "members"] } },
        orderBy: [{ startYear: "desc" }, { isCurrent: "desc" }],
      },
    },
  });

  if (!member) return NextResponse.json({ error: "找不到此會員" }, { status: 404 });

  return NextResponse.json({
    member: {
      id: member.id,
      name: member.name,
      title: member.title,
      bio: member.bio,
      photoUrl: member.photoUrl,
      memberNo: member.memberNo,
      joinYear: member.joinYear,
      organization: member.organization,
      tags: member.tags,
      experiences: member.experiences.map(serializeExperience),
    },
  });
}
