import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { APPROVER_ROLES, getAdministeredOrganizationIds } from "@/lib/admin-scope";

const bodySchema = z.object({
  action: z.enum(["verify", "reject"]),
  rejectedReason: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ experienceId: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { experienceId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少 action" }, { status: 400 });

  const prisma = await getPrisma();
  const roles = await prisma.adminRole.findMany({
    where: { memberId: me.id, role: { in: APPROVER_ROLES }, validUntil: null },
  });
  if (roles.length === 0) return NextResponse.json({ error: "您沒有審核權限" }, { status: 403 });

  const orgIds = await getAdministeredOrganizationIds(prisma, roles);

  const target = await prisma.memberExperience.findUnique({
    where: { id: experienceId },
    include: { member: { select: { organizationId: true } } },
  });
  if (
    !target ||
    target.verificationStatus !== "under_review" ||
    (orgIds && !orgIds.includes(target.member.organizationId))
  ) {
    return NextResponse.json({ error: "找不到此待審核資歷" }, { status: 404 });
  }

  if (parsed.data.action === "verify") {
    await prisma.memberExperience.update({
      where: { id: experienceId },
      data: {
        verificationStatus: "verified",
        verifiedById: me.id,
        verifiedAt: new Date(),
        rejectedReason: null,
      },
    });
    return NextResponse.json({ ok: true, status: "verified" });
  }

  await prisma.memberExperience.update({
    where: { id: experienceId },
    data: {
      verificationStatus: "rejected",
      verifiedById: me.id,
      verifiedAt: new Date(),
      rejectedReason: parsed.data.rejectedReason || null,
    },
  });
  return NextResponse.json({ ok: true, status: "rejected" });
}
