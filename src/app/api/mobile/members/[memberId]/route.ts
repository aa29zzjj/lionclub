import { NextRequest, NextResponse } from "next/server";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { serializeExperience } from "@/lib/member-experience";
import { isBlockedEitherWay } from "@/lib/member-block";

export async function GET(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const auth = await requireMobileMember(req);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });
  const { prisma, member: me } = auth;

  const { memberId } = await params;

  if (memberId !== me.id) {
    if (await isBlockedEitherWay(prisma, me.id, memberId)) {
      return NextResponse.json({ error: "找不到此會員" }, { status: 404 });
    }
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

  const blockedByMe =
    memberId === me.id
      ? false
      : Boolean(await prisma.memberBlock.findUnique({ where: { blockerId_blockedId: { blockerId: me.id, blockedId: memberId } } }));

  return NextResponse.json({
    member: {
      id: member.id,
      name: member.name,
      nickname: member.nickname,
      title: member.title,
      bio: member.bio,
      photoUrl: member.photoUrl,
      memberNo: member.memberNo,
      joinYear: member.joinYear,
      joinMonth: member.joinMonth,
      organization: member.organization,
      tags: member.tags,
      experiences: member.experiences.map(serializeExperience),
      blockedByMe,
    },
  });
}
