import { getPrisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import { activeAdminRoleWhere, isActiveAdminRole } from "./active-admin-role";
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
 * 資歷審核入口的粗篩名單，不是完整授權判斷。最終須由 experience-review
 * 依職位、直接上下級、有效授權及精確scope判斷；只有 GMT 專用角色核實直屬專區主席。
 * 資歷專用角色不加入 APPROVER_ROLES，避免順帶產生會員異動等行政權力。
 */
export const EXPERIENCE_REVIEW_ROLES = [
  ...APPROVER_ROLES,
  "DISTRICT_GOVERNOR",
  "DISTRICT_SECRETARY",
  "DISTRICT_CABINET",
  "DISTRICT_GMT_COORDINATOR",
];

export const CLUB_ASSIGNABLE_ROLES = ["CLUB_OFFICER", "CLUB_FINANCE", "CLUB_VICE_PRESIDENT", "CLUB_PRESIDENT"] as const;
export const DISTRICT_REVIEW_ASSIGNABLE_ROLES = ["DISTRICT_GOVERNOR", "DISTRICT_SECRETARY", "DISTRICT_CABINET", "DISTRICT_GMT_COORDINATOR"] as const;
export const ROLE_MANAGER_ROLES = ["CLUB_PRESIDENT", "ZONE_ADMIN", "DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"];
export const MAX_REVIEW_GRANT_DAYS = 366;
type RoleGrant = { role: string; scopeId: string | null; scopeType: string; validFrom: Date; validUntil: Date | null };
type RoleOrganization = { id: string; name: string; level: string; parentId: string | null; districtCode: string | null; isActive: boolean; validFrom: Date | null; validTo: Date | null };
export type RoleAdministrationContext = { roles: RoleGrant[]; organizations: RoleOrganization[]; now: Date };
const managerLevels: Record<string, string> = { CLUB_PRESIDENT: "club", ZONE_ADMIN: "zone", DISTRICT_ADMIN: "district", MULTIDISTRICT_ADMIN: "md" };
const directParentLevels: Record<string, string> = { club: "zone", zone: "region", region: "district", district: "md", md: "international" };

function roleOrganizationChain(context: RoleAdministrationContext, id: string) {
  const byId = new Map(context.organizations.map(organization => [organization.id, organization]));
  const chain: RoleOrganization[] = []; const seen = new Set<string>();
  let node = byId.get(id);
  while (node) {
    if (seen.has(node.id) || seen.size >= 32 || !node.isActive || (node.validFrom && node.validFrom > context.now) || (node.validTo && node.validTo <= context.now)) return [];
    seen.add(node.id); chain.push(node);
    if (!node.parentId) return chain;
    const parent = byId.get(node.parentId);
    if (!parent || directParentLevels[node.level] !== parent.level) return [];
    node = parent;
  }
  return [];
}

export function hasGlobalRoleAdministration(context: RoleAdministrationContext) {
  return context.roles.some(role => role.role === "SUPER_ADMIN" && role.scopeType === "GLOBAL" && role.scopeId === null && isActiveAdminRole(role, context.now));
}

/** District review-only grants require manual configuration by a live GLOBAL SUPER. */
export function canAdministerRoleOrganization(context: RoleAdministrationContext, organizationId: string) {
  const chain = roleOrganizationChain(context, organizationId);
  if (!chain.length || !["club", "district"].includes(chain[0].level)) return false;
  if (hasGlobalRoleAdministration(context)) return true;
  if (chain[0].level !== "club") return false;
  return context.roles.some(role => ROLE_MANAGER_ROLES.includes(role.role) && isActiveAdminRole(role, context.now) &&
    role.scopeType === managerLevels[role.role] && !!role.scopeId && chain.some(org => org.id === role.scopeId && org.level === role.scopeType));
}

export function roleMemberOrganizationIds(context: RoleAdministrationContext, organizationId: string) {
  if (!canAdministerRoleOrganization(context, organizationId)) return [];
  return context.organizations.filter(org => org.level === "club" && roleOrganizationChain(context, org.id).some(ancestor => ancestor.id === organizationId)).map(org => org.id);
}

export function assignableRoleNames(level: string): readonly string[] {
  return level === "club" ? CLUB_ASSIGNABLE_ROLES : level === "district" ? DISTRICT_REVIEW_ASSIGNABLE_ROLES : [];
}

export async function loadRoleAdministrationContext(db: Database, actorId: string): Promise<RoleAdministrationContext> {
  const now = new Date();
  const actor = await db.member.findFirst({ where: { id: actorId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
  if (!actor) return { roles: [], organizations: [], now };
  const roles = await db.adminRole.findMany({ where: { memberId: actorId, role: { in: ROLE_MANAGER_ROLES }, ...activeAdminRoleWhere(now) } });
  const organizations = await db.organization.findMany({ select: { id: true, name: true, level: true, parentId: true, districtCode: true, isActive: true, validFrom: true, validTo: true } });
  return { roles, organizations, now };
}

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
 * Administrative flows only. Experience verification uses the direct-tier matrix,
 * not this descendant expansion.
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
