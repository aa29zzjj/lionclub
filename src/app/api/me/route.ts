import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { getSession } from "@/lib/session";
import { sendVerificationEmail } from "@/lib/email-verification";

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
    joinMonth: member.joinMonth,
    birthday: member.birthday,
    status: member.status,
    emailVerifiedAt: member.emailVerifiedAt,
    organizationAssignmentStatus: member.organizationAssignmentStatus,
    organizationAssignmentVersion: member.organizationAssignmentVersion,
    declaredOrganizationName: member.declaredOrganizationName,
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
  photoUrl: z.union([z.string().url(), z.literal("")]).optional(),
  birthday: z.union([z.string().date(), z.literal("")]).optional(),
});

export async function PATCH(req: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "欄位格式錯誤" }, { status: 400 });
  const { name, title, email, phone, bio, tags, photoUrl, birthday } = parsed.data;

  const prisma = await getPrisma();

  let member;
  try {
    member = await prisma.$transaction(async (tx) => {
      const updated = await tx.member.update({
        where: { id: me.id },
        data: {
          name,
          title,
          email,
          phone,
          bio,
          photoUrl: photoUrl === "" ? null : photoUrl,
          birthday: birthday === "" ? null : birthday ? new Date(birthday) : undefined,
          emailVerifiedAt: email ? null : undefined,
          tags: tags
            ? { set: [], connectOrCreate: tags.map((tagName) => ({ where: { name: tagName }, create: { name: tagName } })) }
            : undefined,
        },
        include: { organization: true, tags: true, adminRoles: { where: { validUntil: null } } },
      });

      if (email) {
        const session = await getSession();
        if (session) {
          await tx.user.update({ where: { id: session.userId }, data: { email } });
        }
      }

      return updated;
    });

    if (email) {
      const session = await getSession();
      const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, "");
      if (session) {
        await sendVerificationEmail(prisma, { userId: session.userId, email, name: member.name, appOrigin }).catch(() =>
          console.error("Verification email failed")
        );
      }
    }
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "此 Email 已被使用" }, { status: 409 });
    }
    throw err;
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
    joinMonth: member.joinMonth,
    birthday: member.birthday,
    status: member.status,
    emailVerifiedAt: member.emailVerifiedAt,
    organizationAssignmentStatus: member.organizationAssignmentStatus,
    organizationAssignmentVersion: member.organizationAssignmentVersion,
    declaredOrganizationName: member.declaredOrganizationName,
    organization: member.organization,
    tags: member.tags,
    adminRoles: member.adminRoles,
  });
}
