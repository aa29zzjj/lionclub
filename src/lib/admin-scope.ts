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
