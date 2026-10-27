import { getPrisma } from "./prisma";
import { getSession } from "./session";
import type { Prisma } from "@prisma/client";
import { activeAdminRoleWhere } from "./active-admin-role";
import type { SessionPayload } from "./auth-session";

export async function getMemberForSession(session: SessionPayload) {
  const prisma = await getPrisma();
  const now = new Date();
  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    include: {
      organization: true,
      adminRoles: {
        where: activeAdminRoleWhere(now),
      },
      tags: true,
      user: { select: { id: true } },
    },
  });

  if (!member || member.status !== "ACTIVE" || member.deletedAt || member.user?.id !== session.userId) return null;
  return member;
}

export async function getCurrentMember() {
  const session = await getSession();
  if (!session) return null;
  return getMemberForSession(session);
}

/** 檢查目前會員是否對指定分會（或其上層組織）有指定的管理角色 */
export async function hasAdminRoleForOrganization(
  memberId: string,
  organizationId: string,
  allowedRoles: string[],
  database?: Prisma.TransactionClient,
) {
  const now = new Date();
  const prisma = database ?? await getPrisma();

  const roles = await prisma.adminRole.findMany({
    where: {
      memberId,
      role: { in: allowedRoles },
      ...activeAdminRoleWhere(now),
    },
  });

  if (roles.length === 0) return false;

  // Only SUPER_ADMIN is global. Missing legacy scope fails closed, never grants the world.
  if (roles.some((r) => r.role === "SUPER_ADMIN")) return true;

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
  const visited = new Set([org.id]);
  while (current.parentId) {
    if (visited.has(current.parentId)) return false;
    visited.add(current.parentId);
    if (scopeIds.has(current.parentId)) return true;
    const parent = await prisma.organization.findUnique({ where: { id: current.parentId } });
    if (!parent) break;
    current = parent;
  }

  return false;
}
