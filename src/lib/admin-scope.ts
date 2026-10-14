import { getPrisma } from "./prisma";
import type { Prisma } from "@prisma/client";
type Database = Awaited<ReturnType<typeof getPrisma>> | Prisma.TransactionClient;

export const APPROVER_ROLES = [
  "CLUB_OFFICER",
  "CLUB_VICE_PRESIDENT",
  "CLUB_PRESIDENT",
  "CLUB_FINANCE",
  "ZONE_ADMIN",
  "REGION_ADMIN",
  "DISTRICT_ADMIN",
  "MULTIDISTRICT_ADMIN",
  "SUPER_ADMIN",
];

/**
 * 區層級審核職務（總監／秘書長／區內閣）：僅能查核會員資歷，不具分會管理／會員異動等行政權力，
 * 因此只加進資歷審核用的角色清單，不加入 APPROVER_ROLES（該清單同時也用於新會員申請審核等行政流程）。
 */
export const EXPERIENCE_REVIEW_ROLES = [
  ...APPROVER_ROLES,
  "DISTRICT_GOVERNOR",
  "DISTRICT_SECRETARY",
  "DISTRICT_CABINET",
];

async function getDescendantOrganizationIds(prisma: Database, rootId: string) {
  const ids = new Set([rootId]);
  let frontier = [rootId];
  while (frontier.length > 0) {
    const children = await prisma.organization.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    const childIds = children.map((c) => c.id).filter((id) => !ids.has(id));
    if (childIds.length === 0) break;
    childIds.forEach((id) => ids.add(id));
    frontier = childIds;
  }
  return [...ids];
}

/**
 * Given a member's active admin roles, returns the organization ids they may administer
 * (their scope plus all descendant organizations), or `undefined` if they have global scope.
 */
export async function getAdministeredOrganizationIds(
  prisma: Database,
  roles: { role: string; scopeId: string | null }[]
): Promise<string[] | undefined> {
  const isGlobal = roles.some((r) => r.role === "SUPER_ADMIN");
  if (isGlobal) return undefined;

  const scopeIds = Array.from(new Set(roles.map((r) => r.scopeId).filter(Boolean))) as string[];
  const sets = await Promise.all(scopeIds.map((id) => getDescendantOrganizationIds(prisma, id)));
  return Array.from(new Set(sets.flat()));
}
