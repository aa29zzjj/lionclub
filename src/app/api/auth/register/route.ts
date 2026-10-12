import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { sendSesEmail } from "@/lib/aws-http";
import { generateMemberNo } from "@/lib/member-no";

const APPROVER_ROLES = [
  "CLUB_OFFICER",
  "CLUB_VICE_PRESIDENT",
  "CLUB_PRESIDENT",
  "CLUB_FINANCE",
  "ZONE_ADMIN",
  "DISTRICT_ADMIN",
  "MULTIDISTRICT_ADMIN",
  "SUPER_ADMIN",
];

const bodySchema = z.object({
  organizationId: z.string().min(1),
  pin: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "密碼至少需要 8 個字元"),
  birthday: z.string().optional(),
  phone: z.string().optional(),
  title: z.string().optional(),
  bio: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });
  }
  const { organizationId, pin, name, email, password, birthday, phone, title, bio, tags } = parsed.data;

  const prisma = await getPrisma();
  const invite = await prisma.clubInvite.findFirst({
    where: {
      organizationId,
      pin,
      revokedAt: null,
      validFrom: { lte: new Date() },
      validUntil: { gte: new Date() },
    },
    include: { organization: true },
  });

  if (!invite) {
    return NextResponse.json({ error: "PIN 碼不正確或已過期，請向分會幹部確認" }, { status: 400 });
  }
  if (invite.usageLimit != null && invite.usageCount >= invite.usageLimit) {
    return NextResponse.json({ error: "此邀請已達使用上限，請向分會幹部索取新的邀請" }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json({ error: "此 Email 已經註冊過了" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const memberNo = await generateMemberNo(prisma, invite.organizationId);

  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.member.create({
      data: {
        name,
        email,
        birthday: birthday ? new Date(birthday) : undefined,
        phone,
        title,
        bio,
        status: "PENDING",
        memberNo,
        organizationId: invite.organizationId,
        tags: tags?.length
          ? {
              connectOrCreate: tags.map((tagName) => ({
                where: { name: tagName },
                create: { name: tagName },
              })),
            }
          : undefined,
      },
    });

    await tx.user.create({
      data: { email, passwordHash, memberId: created.id },
    });

    await tx.clubInvite.update({
      where: { id: invite.id },
      data: { usageCount: { increment: 1 } },
    });

    return created;
  });

  void sendRegistrationEmails(prisma, {
    memberName: name,
    memberEmail: email,
    organizationId: invite.organizationId,
    organizationName: invite.organization.name,
    req,
  }).catch((error) => console.error("Registration email failed", error));

  return NextResponse.json({
    ok: true,
    memberId: member.id,
    organizationName: invite.organization.name,
  });
}

async function getOrganizationAncestorIds(prisma: Awaited<ReturnType<typeof getPrisma>>, organizationId: string) {
  const ids = [organizationId];
  let currentId: string | null = organizationId;
  while (currentId) {
    const org: { parentId: string | null } | null = await prisma.organization.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    if (!org?.parentId) break;
    ids.push(org.parentId);
    currentId = org.parentId;
  }
  return ids;
}

async function sendRegistrationEmails(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  input: { memberName: string; memberEmail: string; organizationId: string; organizationName: string; req: NextRequest }
) {
  const from = process.env.PASSWORD_RESET_FROM_EMAIL;
  if (!from) return;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-northeast-1";
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || input.req.nextUrl.origin).replace(/\/$/, "");

  await sendSesEmail({
    region,
    from,
    to: input.memberEmail,
    subject: "獅子會 App 入會申請已收到",
    text: `${input.memberName} 您好，\n\n我們已收到您加入「${input.organizationName}」的申請，待分會幹部審核通過後即可登入使用。\n\n如果這不是你本人提出的申請，請忽略此信。`,
  });

  const scopeIds = await getOrganizationAncestorIds(prisma, input.organizationId);
  const approvers = await prisma.member.findMany({
    where: {
      email: { not: null },
      adminRoles: {
        some: {
          role: { in: APPROVER_ROLES },
          validUntil: null,
          OR: [{ scopeId: null }, { scopeId: { in: scopeIds } }],
        },
      },
    },
    select: { email: true },
  });

  await Promise.all(
    approvers
      .filter((approver): approver is { email: string } => Boolean(approver.email))
      .map((approver) =>
        sendSesEmail({
          region,
          from,
          to: approver.email,
          subject: "獅子會 App 有新的入會申請待審核",
          text: `${input.memberName}（${input.memberEmail}）申請加入「${input.organizationName}」，目前狀態為待審核，請登入系統查看。\n\n${appOrigin}`,
        })
      )
  );
}
