import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
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

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  title: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "欄位格式錯誤" }, { status: 400 });
  const { name, title, email, phone, bio, tags } = parsed.data;

  const prisma = await getPrisma();
  const member = await prisma.member.update({
    where: { id: me.id },
    data: {
      name,
      title,
      email,
      phone,
      bio,
      tags: tags
        ? { set: [], connectOrCreate: tags.map((tagName) => ({ where: { name: tagName }, create: { name: tagName } })) }
        : undefined,
    },
    include: { organization: true, tags: true, adminRoles: { where: { validUntil: null } } },
  });

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
