import { NextResponse } from "next/server";
import { getCurrentMember, hasAdminRoleForOrganization } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";

const managerRoles = ["CLUB_PRESIDENT", "ZONE_ADMIN", "DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"];

export async function DELETE(_request: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (!(await hasAdminRoleForOrganization(me.id, me.organizationId, managerRoles))) {
    return NextResponse.json({ error: "沒有幹部權限管理資格" }, { status: 403 });
  }

  const { roleId } = await params;
  const prisma = await getPrisma();
  const role = await prisma.adminRole.findFirst({
    where: { id: roleId, scopeId: me.organizationId, role: { in: ["CLUB_OFFICER", "CLUB_FINANCE", "CLUB_VICE_PRESIDENT", "CLUB_PRESIDENT"] } },
  });
  if (!role) return NextResponse.json({ error: "找不到可撤銷的權限" }, { status: 404 });
  if (role.memberId === me.id) return NextResponse.json({ error: "不能在此撤銷自己的管理權限" }, { status: 409 });

  await prisma.adminRole.delete({ where: { id: role.id } });
  return NextResponse.json({ ok: true });
}
