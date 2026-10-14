import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { EXPERIENCE_REVIEW_ROLES, getAdministeredOrganizationIds } from "@/lib/admin-scope";
import { serializeExperience } from "@/lib/member-experience";
import { activeAdminRoleWhere } from "@/lib/active-admin-role";

export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const prisma = await getPrisma();
  const roles = await prisma.adminRole.findMany({
    where: { memberId: me.id, role: { in: EXPERIENCE_REVIEW_ROLES }, ...activeAdminRoleWhere() },
  });
  if (roles.length === 0) {
    return NextResponse.json({ error: "您沒有審核權限" }, { status: 403 });
  }

  const orgIds = await getAdministeredOrganizationIds(prisma, roles);
  if (orgIds && !orgIds.length) return NextResponse.json({ error: "管理權限尚未設定組織範圍，請聯絡管理者" }, { status: 403 });

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
