import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { APPROVER_ROLES, getAdministeredOrganizationIds } from "@/lib/admin-scope";

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

  const members = await prisma.member.findMany({
    where: {
      status: "PENDING",
      ...(orgIds ? { organizationId: { in: orgIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: { organization: { select: { id: true, name: true } } },
  });

  return NextResponse.json({
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      phone: m.phone,
      organization: m.organization,
      createdAt: m.createdAt,
    })),
  });
}
