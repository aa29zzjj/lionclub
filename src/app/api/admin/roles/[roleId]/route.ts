import { NextResponse } from "next/server";
import { getCurrentMember, hasAdminRoleForOrganization } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";

const managerRoles = ["CLUB_PRESIDENT", "ZONE_ADMIN", "DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"];
const revocableRoles = ["CLUB_OFFICER", "CLUB_FINANCE", "CLUB_VICE_PRESIDENT", "CLUB_PRESIDENT"];

export async function DELETE(_request: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { roleId } = await params;
  const prisma = await getPrisma();
  const role = await prisma.adminRole.findFirst({
    where: { id: roleId, OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }], role: { in: revocableRoles } },
  });
  if (!role?.scopeId) return NextResponse.json({ error: "找不到可撤銷的權限" }, { status: 404 });
  if (!(await hasAdminRoleForOrganization(me.id, role.scopeId, managerRoles))) {
    return NextResponse.json({ error: "沒有權限管理此分會" }, { status: 403 });
  }
  if (role.memberId === me.id) return NextResponse.json({ error: "不能在此撤銷自己的管理權限" }, { status: 409 });

  await prisma.adminRole.update({ where: { id: role.id }, data: { validUntil: new Date() } });
  return NextResponse.json({ ok: true });
}
