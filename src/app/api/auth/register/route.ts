import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";

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

  return NextResponse.json({
    ok: true,
    memberId: member.id,
    organizationName: invite.organization.name,
  });
}
