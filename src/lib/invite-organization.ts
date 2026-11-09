import type { Prisma } from "@prisma/client";
import { activeAdminRoleWhere } from "./active-admin-role";
import { canAdministerRoleOrganization, loadRoleAdministrationContext } from "./admin-scope";
import { OnboardingError } from "./central-onboarding";

const OWN_CLUB_ISSUERS = ["CLUB_OFFICER", "CLUB_VICE_PRESIDENT", "CLUB_FINANCE"];
const PARENT_LEVEL: Record<string, string> = { club: "zone", zone: "region", region: "district", district: "md", md: "international" };

/** A caller may choose a target, but the live scoped grant decides access. */
export async function resolveInviteOrganization(
  tx: Prisma.TransactionClient,
  member: { id: string; organizationId: string },
  requestedOrganizationId = member.organizationId,
) {
  const actor = await tx.member.findFirst({ where: { id: member.id, organizationId: member.organizationId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
  if (!actor) throw new OnboardingError(403, "會籍或權限已變更，請重新載入後操作");
  const context = await loadRoleAdministrationContext(tx, member.id);
  const organization = context.organizations.find(org => org.id === requestedOrganizationId && org.level === "club");
  if (!organization) throw new OnboardingError(403, "沒有此分會的邀請管理權限");

  // The existing role-administration check validates every active ancestor and
  // accepts SUPER_ADMIN only with an explicit GLOBAL / null-scope grant.
  if (canAdministerRoleOrganization(context, organization.id)) return { id: organization.id, name: organization.name };

  // Preserve existing own-club officers' invitation access without extending
  // those grants to other clubs or treating a malformed SUPER grant as global.
  if (organization.id !== member.organizationId) throw new OnboardingError(403, "沒有此分會的邀請管理權限");
  const organizations = new Map(context.organizations.map(org => [org.id, org]));
  const seen = new Set<string>();
  let current = organization;
  while (true) {
    if (seen.has(current.id) || seen.size >= 32 || !current.isActive || (current.validFrom && current.validFrom > context.now) || (current.validTo && current.validTo <= context.now)) throw new OnboardingError(403, "分會或上層組織已失效，無法管理邀請");
    seen.add(current.id);
    if (!current.parentId) break;
    const parent = organizations.get(current.parentId);
    if (!parent || PARENT_LEVEL[current.level] !== parent.level) throw new OnboardingError(403, "分會組織範圍未完整設定，無法管理邀請");
    current = parent;
  }
  const grant = await tx.adminRole.findFirst({ where: { memberId: member.id, role: { in: OWN_CLUB_ISSUERS }, scopeType: "club", scopeId: organization.id, ...activeAdminRoleWhere(context.now) }, select: { id: true } });
  if (!grant) throw new OnboardingError(403, "沒有此分會的邀請管理權限");
  return { id: organization.id, name: organization.name };
}
