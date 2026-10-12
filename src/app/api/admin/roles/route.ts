import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentMember, hasAdminRoleForOrganization } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";

const managerRoles = ["CLUB_PRESIDENT", "ZONE_ADMIN", "DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"];
const assignableRoles = ["CLUB_OFFICER", "CLUB_FINANCE"] as const;

async function canManage(memberId: string, organizationId: string) {
  return hasAdminRoleForOrganization(memberId, organizationId, managerRoles);
}

export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (!(await canManage(me.id, me.organizationId))) {
    return NextResponse.json({ error: "沒有幹部權限管理資格" }, { status: 403 });
  }

  const prisma = await getPrisma();
  const members = await prisma.member.findMany({
    where: { organizationId: me.organizationId, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      title: true,
      adminRoles: {
        where: { validUntil: null, scopeId: me.organizationId },
        select: { id: true, role: true, validFrom: true },
      },
    },
  });
  return NextResponse.json({ organization: me.organization, members, assignableRoles });
}

const createSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(assignableRoles),
});

export async function POST(request: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (!(await canManage(me.id, me.organizationId))) {
    return NextResponse.json({ error: "沒有幹部權限管理資格" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "欄位格式錯誤" }, { status: 400 });

  const prisma = await getPrisma();
  const target = await prisma.member.findFirst({
    where: { id: parsed.data.memberId, organizationId: me.organizationId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ error: "找不到本分會的啟用會員" }, { status: 404 });

  const existing = await prisma.adminRole.findFirst({
    where: { memberId: target.id, role: parsed.data.role, scopeId: me.organizationId, validUntil: null },
  });
  if (existing) return NextResponse.json({ error: "此會員已有相同權限" }, { status: 409 });

  const role = await prisma.adminRole.create({
    data: {
      memberId: target.id,
      role: parsed.data.role,
      scopeType: "club",
      scopeId: me.organizationId,
      grantedById: me.id,
    },
  });
  return NextResponse.json({ role }, { status: 201 });
}
