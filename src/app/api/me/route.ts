import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/current-member";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  return NextResponse.json({
    id: member.id,
    name: member.name,
    email: member.email,
    title: member.title,
    bio: member.bio,
    phone: member.phone,
    photoUrl: member.photoUrl,
    memberNo: member.memberNo,
    joinYear: member.joinYear,
    status: member.status,
    organization: member.organization,
    tags: member.tags,
    adminRoles: member.adminRoles,
  });
}
