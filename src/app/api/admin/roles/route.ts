import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdministeredOrganizationIds } from "@/lib/admin-scope";
import { getCurrentMember, hasAdminRoleForOrganization } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";

const managerRoles = ["CLUB_PRESIDENT", "ZONE_ADMIN", "DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"];
const assignableRoles = ["CLUB_OFFICER", "CLUB_FINANCE", "CLUB_VICE_PRESIDENT", "CLUB_PRESIDENT"] as const;

async function canManage(memberId: string, organizationId: string) {
  return hasAdminRoleForOrganization(memberId, organizationId, managerRoles);
}

async function getManageableClubs(memberId: string) {
  const prisma = await getPrisma();
  const now = new Date();
  const roles = await prisma.adminRole.findMany({
    where: {
      memberId,
      role: { in: managerRoles },
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
    },
    select: { role: true, scopeId: true },
  });
  if (roles.length === 0) return [];

  const organizationIds = await getAdministeredOrganizationIds(prisma, roles);
  return prisma.organization.findMany({
    where: {
      level: "club",
      isActive: true,
      ...(organizationIds ? { id: { in: organizationIds } } : {}),
    },
    orderBy: [{ districtCode: "asc" }, { name: "asc" }],
    select: { id: true, name: true, districtCode: true },
  });
}

export async function GET(request: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const organizations = await getManageableClubs(me.id);
  if (organizations.length === 0) {
    return NextResponse.json({ error: "沒有幹部權限管理資格" }, { status: 403 });
  }

  const requestedOrganizationId = request.nextUrl.searchParams.get("organizationId");
  const organization = requestedOrganizationId
    ? organizations.find((item) => item.id === requestedOrganizationId)
    : organizations.find((item) => item.id === me.organizationId) ?? organizations[0];
  if (!organization) {
    return NextResponse.json({ error: "沒有權限管理此分會" }, { status: 403 });
  }

  const prisma = await getPrisma();
  const members = await prisma.member.findMany({
    where: { organizationId: organization.id, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      title: true,
      adminRoles: {
        where: { validUntil: null, scopeId: organization.id, role: { in: [...assignableRoles] } },
        select: { id: true, role: true, validFrom: true },
      },
    },
  });
  return NextResponse.json({ organizations, organization, members, assignableRoles });
}

const createSchema = z.object({
  organizationId: z.string().min(1),
  memberId: z.string().min(1),
  role: z.enum(assignableRoles),
});

export async function POST(request: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "欄位格式錯誤" }, { status: 400 });
  if (!(await canManage(me.id, parsed.data.organizationId))) {
    return NextResponse.json({ error: "沒有權限管理此分會" }, { status: 403 });
  }

  const prisma = await getPrisma();
  const organization = await prisma.organization.findFirst({
    where: { id: parsed.data.organizationId, level: "club", isActive: true },
    select: { id: true },
  });
  if (!organization) return NextResponse.json({ error: "找不到可管理的分會" }, { status: 404 });

  const target = await prisma.member.findFirst({
    where: { id: parsed.data.memberId, organizationId: organization.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ error: "找不到此分會的啟用會員" }, { status: 404 });

  const existing = await prisma.adminRole.findFirst({
    where: { memberId: target.id, role: parsed.data.role, scopeId: organization.id, validUntil: null },
  });
  if (existing) return NextResponse.json({ error: "此會員已有相同權限" }, { status: 409 });

  const role = await prisma.adminRole.create({
    data: {
      memberId: target.id,
      role: parsed.data.role,
      scopeType: "club",
      scopeId: organization.id,
      grantedById: me.id,
    },
  });
  return NextResponse.json({ role }, { status: 201 });
}
