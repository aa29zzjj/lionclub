import { getPrisma } from "./prisma";
import { getSession } from "./session";

export async function getCurrentMember() {
  const session = await getSession();
  if (!session) return null;

  const prisma = await getPrisma();
  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    include: {
      organization: true,
      adminRoles: {
        where: { validUntil: null },
      },
      tags: true,
    },
  });

  return member;
}

/** 檢查目前會員是否對指定分會（或其上層組織）有指定的管理角色 */
export async function hasAdminRoleForOrganization(
  memberId: string,
  organizationId: string,
  allowedRoles: string[]
) {
  const now = new Date();
  const prisma = await getPrisma();

  const roles = await prisma.adminRole.findMany({
    where: {
      memberId,
      role: { in: allowedRoles },
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
    },
  });

  if (roles.length === 0) return false;

  // SUPER_ADMIN 或 scopeId 為 null（全域）一律通過
  if (roles.some((r) => r.role === "SUPER_ADMIN" || !r.scopeId)) return true;

  // 找出該會員所有管理角色涵蓋的組織 id，往上比對是否包含 organizationId
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
  });
  if (!org) return false;

  const scopeIds = new Set(roles.map((r) => r.scopeId).filter(Boolean) as string[]);

  // 直接命中（管理的就是這個分會本身）
  if (scopeIds.has(organizationId)) return true;

  // 往上層找：分會的上層是分區/專區/複合區，管理角色若掛在上層也算通過
  let current = org;
  while (current.parentId) {
    if (scopeIds.has(current.parentId)) return true;
    const parent = await prisma.organization.findUnique({ where: { id: current.parentId } });
    if (!parent) break;
    current = parent;
  }

  return false;
}
