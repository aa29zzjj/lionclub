import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { APPROVER_ROLES, getAdministeredOrganizationIds } from "@/lib/admin-scope";
import { serializeExperience } from "@/lib/member-experience";

export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const prisma = await getPrisma();
  const roles = await prisma.adminRole.findMany({
    where: { memberId: me.id, role: { in: APPROVER_ROLES }, validUntil: null },
  });
  if (roles.length === 0) {
    return NextResponse.json({ error: "您沒有審核權限" }, { status: 403 });
  }

  const orgIds = await getAdministeredOrganizationIds(prisma, roles);

  const experiences = await prisma.memberExperience.findMany({
    where: {
      verificationStatus: "under_review",
      member: orgIds ? { organizationId: { in: orgIds } } : undefined,
    },
    orderBy: [{ createdAt: "asc" }],
    include: { member: { select: { id: true, name: true, organization: { select: { name: true } } } } },
  });

  return NextResponse.json({
    experiences: experiences.map((e) => ({
      ...serializeExperience(e),
      member: e.member,
    })),
  });
}
