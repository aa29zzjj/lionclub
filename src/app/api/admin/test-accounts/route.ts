import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getCurrentMember, hasAdminRoleForOrganization } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";

const ALLOWED_ROLES = [
  "CLUB_OFFICER",
  "CLUB_PRESIDENT",
  "DISTRICT_ADMIN",
  "MULTIDISTRICT_ADMIN",
  "SUPER_ADMIN",
];

const bodySchema = z.object({
  accounts: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        email: z.string().trim().email(),
        password: z.string().min(4),
      })
    )
    .min(1)
    .max(10),
});

// 一次性資料建立端點：建立測試會員後即從正式版本移除。
export async function POST(req: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const allowed = await hasAdminRoleForOrganization(me.id, me.organizationId, ALLOWED_ROLES);
  if (!allowed) return NextResponse.json({ error: "沒有建立測試帳號的權限" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });
  }

  const prisma = await getPrisma();
  const results: Array<{ email: string; status: "created" | "exists"; memberId?: string }> = [];

  for (const account of parsed.data.accounts) {
    const existingUser = await prisma.user.findFirst({
      where: { email: { equals: account.email, mode: "insensitive" } },
      select: { memberId: true },
    });
    const existingMember = await prisma.member.findFirst({
      where: { email: { equals: account.email, mode: "insensitive" } },
      select: { id: true },
    });

    if (existingUser || existingMember) {
      results.push({
        email: account.email,
        status: "exists",
        memberId: existingUser?.memberId ?? existingMember?.id,
      });
      continue;
    }

    const passwordHash = await bcrypt.hash(account.password, 10);
    const member = await prisma.$transaction(async (tx) => {
      const created = await tx.member.create({
        data: {
          name: account.name,
          email: account.email,
          role: "MEMBER",
          status: "ACTIVE",
          organizationId: me.organizationId,
        },
      });
      await tx.user.create({
        data: { email: account.email, passwordHash, memberId: created.id },
      });
      return created;
    });

    results.push({ email: account.email, status: "created", memberId: member.id });
  }

  return NextResponse.json({
    ok: true,
    organization: { id: me.organization.id, name: me.organization.name },
    results,
  });
}
