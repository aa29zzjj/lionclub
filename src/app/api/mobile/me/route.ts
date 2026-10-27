import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAppSecrets } from "@/lib/secrets";
import { bearerToken, readMobileToken } from "@/lib/mobile-auth";
import { getMemberForSession } from "@/lib/current-member";
import type { SessionUser } from "@/lib/auth-session";

export async function GET(req: NextRequest) {
  const token = bearerToken(req.headers.get("authorization"));
  if (!token) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const prisma = await getPrisma();
  const { AUTH_SECRET } = await getAppSecrets();
  const key = new TextEncoder().encode(AUTH_SECRET);

  const session = await readMobileToken(token, "mobile_access", {
    key,
    findUser: (id) =>
      prisma.user.findUnique({
        where: { id },
        select: { id: true, memberId: true, email: true, sessionVersion: true, member: { select: { memberNo: true } } },
      }) as unknown as Promise<SessionUser | null>,
    production: process.env.NODE_ENV === "production",
  });
  if (!session) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });

  const member = await getMemberForSession(session);
  if (!member) return NextResponse.json({ error: "未登入" }, { status: 401 });

  return NextResponse.json({
    id: member.id,
    name: member.name,
    nickname: member.nickname,
    email: member.email,
    title: member.title,
    bio: member.bio,
    phone: member.phone,
    photoUrl: member.photoUrl,
    memberNo: member.memberNo,
    joinYear: member.joinYear,
    joinMonth: member.joinMonth,
    birthday: member.birthday,
    status: member.status,
    organization: member.organization,
    tags: member.tags,
    adminRoles: member.adminRoles,
  });
}
