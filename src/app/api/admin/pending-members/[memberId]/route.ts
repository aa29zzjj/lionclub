import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { sendSesEmail } from "@/lib/aws-http";
import { APPROVER_ROLES, getAdministeredOrganizationIds } from "@/lib/admin-scope";

const bodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  joinYear: z.number().int().min(1900).max(2100).optional(),
  joinMonth: z.number().int().min(1).max(12).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { memberId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少 action" }, { status: 400 });

  const prisma = await getPrisma();
  const roles = await prisma.adminRole.findMany({
    where: { memberId: me.id, role: { in: APPROVER_ROLES }, validUntil: null },
  });
  if (roles.length === 0) return NextResponse.json({ error: "您沒有審核權限" }, { status: 403 });

  const orgIds = await getAdministeredOrganizationIds(prisma, roles);

  const target = await prisma.member.findUnique({
    where: { id: memberId },
    include: { organization: { select: { name: true } } },
  });
  if (!target || target.status !== "PENDING" || (orgIds && !orgIds.includes(target.organizationId))) {
    return NextResponse.json({ error: "找不到此待審核會員" }, { status: 404 });
  }

  const from = process.env.PASSWORD_RESET_FROM_EMAIL;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-northeast-1";

  if (parsed.data.action === "approve") {
    const now = new Date();
    await prisma.member.update({
      where: { id: memberId },
      data: {
        status: "ACTIVE",
        joinYear: parsed.data.joinYear ?? now.getFullYear(),
        joinMonth: parsed.data.joinMonth ?? now.getMonth() + 1,
      },
    });
    if (from && target.email) {
      void sendSesEmail({
        region,
        from,
        to: target.email,
        subject: "獅子會 App 入會申請已通過",
        text: `${target.name} 您好，\n\n您加入「${target.organization.name}」的申請已審核通過，現在可以登入使用了。`,
      }).catch((error) => console.error("Approval email failed", error));
    }
    return NextResponse.json({ ok: true, status: "ACTIVE" });
  }

  if (from && target.email) {
    void sendSesEmail({
      region,
      from,
      to: target.email,
      subject: "獅子會 App 入會申請未通過",
      text: `${target.name} 您好，\n\n很抱歉，您加入「${target.organization.name}」的申請未通過審核。如有疑問請聯繫分會幹部。`,
    }).catch((error) => console.error("Rejection email failed", error));
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.deleteMany({ where: { memberId } });
    await tx.member.delete({ where: { id: memberId } });
  });

  return NextResponse.json({ ok: true, status: "REJECTED" });
}
