import type { Prisma } from "@prisma/client";
import { activeAdminRoleWhere, isActiveAdminRole } from "./active-admin-role";

export const EVENT_SCOPES = ["CLUB", "ZONE", "REGION", "DISTRICT"] as const;
export type EventScope = (typeof EVENT_SCOPES)[number];

export const eventScopeLabels: Record<EventScope, string> = {
  CLUB: "本分會",
  ZONE: "分區",
  REGION: "專區",
  DISTRICT: "整個區（A1）",
};

/** Official publication always needs an active, correctly scoped system grant. */
export const EVENT_SCOPE_REQUIRED_ROLES: Record<EventScope, string[]> = {
  CLUB: ["CLUB_OFFICER", "CLUB_VICE_PRESIDENT", "CLUB_PRESIDENT", "CLUB_FINANCE", "ZONE_ADMIN", "REGION_ADMIN", "DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"],
  ZONE: ["ZONE_ADMIN", "REGION_ADMIN", "DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"],
  REGION: ["REGION_ADMIN", "DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"],
  DISTRICT: ["DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"],
};
const scopeLevels: Record<EventScope, string> = { CLUB: "club", ZONE: "zone", REGION: "region", DISTRICT: "district" };
const roleLevels: Record<string, string> = {
  CLUB_OFFICER: "club", CLUB_VICE_PRESIDENT: "club", CLUB_PRESIDENT: "club", CLUB_FINANCE: "club",
  ZONE_ADMIN: "zone", REGION_ADMIN: "region", DISTRICT_ADMIN: "district", MULTIDISTRICT_ADMIN: "md",
};
type ScopeDatabase = Pick<Prisma.TransactionClient, "organization" | "adminRole" | "member">;
type ScopeOrganization = { id: string; name: string; level: string; parentId: string | null; isActive: boolean; validFrom: Date | null; validTo: Date | null };
type PublicationRole = { role: string; scopeType: string; scopeId: string | null; validFrom: Date; validUntil: Date | null };
export type EventManagementTarget = { createdById: string; hostOrganizationId: string; category: string; scope: string };
export type EventPublishingOption = { scope: EventScope; hostOrganizationId: string; hostOrganizationName: string };
export class EventScopeError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Missing, inactive, expired, cyclic or broken hierarchy never authorizes publication. */
async function organizationChain(db: ScopeDatabase, organizationId: string, now: Date, cache = new Map<string, ScopeOrganization | null>()): Promise<ScopeOrganization[]> {
  const chain: ScopeOrganization[] = [];
  const seen = new Set<string>();
  let id: string | null = organizationId;
  while (id) {
    if (seen.has(id) || seen.size >= 32) return [];
    seen.add(id);
    const organization: ScopeOrganization | null = cache.has(id) ? cache.get(id)! : await db.organization.findUnique({ where: { id }, select: { id: true, name: true, level: true, parentId: true, isActive: true, validFrom: true, validTo: true } });
    cache.set(id, organization);
    if (!organization?.isActive || (organization.validFrom && organization.validFrom > now) || (organization.validTo && organization.validTo <= now)) return [];
    chain.push(organization);
    id = organization.parentId;
  }
  return chain;
}

function grantsAuthorize(roles: PublicationRole[], scope: EventScope, chain: ScopeOrganization[], now: Date) {
  if (chain[0]?.level !== scopeLevels[scope]) return false;
  return roles.some((role) => {
    if (!EVENT_SCOPE_REQUIRED_ROLES[scope].includes(role.role) || !isActiveAdminRole(role, now)) return false;
    if (role.role === "SUPER_ADMIN") return role.scopeType === "GLOBAL" && role.scopeId === null;
    const level = roleLevels[role.role];
    return Boolean(level && role.scopeType === level && role.scopeId && chain.some((organization) => organization.id === role.scopeId && organization.level === level));
  });
}

export async function canPublishOfficialEvent(db: ScopeDatabase, memberId: string, scope: string, hostOrganizationId: string, now = new Date()): Promise<boolean> {
  if (!EVENT_SCOPES.includes(scope as EventScope)) return false;
  const actor = await db.member.findFirst({ where: { id: memberId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
  if (!actor) return false;
  const roles = await db.adminRole.findMany({ where: { memberId, role: { in: EVENT_SCOPE_REQUIRED_ROLES[scope as EventScope] }, ...activeAdminRoleWhere(now) } });
  if (roles.length === 0) return false;
  return grantsAuthorize(roles, scope as EventScope, await organizationChain(db, hostOrganizationId, now), now);
}

/** Author ownership is sufficient only for personal activities, not an official grant. */
export async function canManageEvent(db: ScopeDatabase, memberId: string, event: EventManagementTarget, now = new Date()) {
  if (event.category === "PERSONAL" && event.scope !== "CLUB") return false;
  if (event.category === "PERSONAL" && event.scope === "CLUB" && event.createdById === memberId) {
    return Boolean(await db.member.findFirst({ where: { id: memberId, status: "ACTIVE", deletedAt: null }, select: { id: true } }));
  }
  if (event.category !== "CLUB_OFFICIAL" && event.category !== "PERSONAL") return false;
  return canPublishOfficialEvent(db, memberId, event.category === "PERSONAL" ? "CLUB" : event.scope, event.hostOrganizationId, now);
}

/** First matching host per level: existing activity's hierarchy, then member's home. */
export async function getEventPublishingOptions(db: ScopeDatabase, memberId: string, organizationId: string, baseOrganizationId = organizationId, now = new Date()): Promise<EventPublishingOption[]> {
  const actor = await db.member.findFirst({ where: { id: memberId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
  if (!actor) return [];
  const grants = await db.adminRole.findMany({ where: { memberId, role: { in: EVENT_SCOPE_REQUIRED_ROLES.CLUB }, ...activeAdminRoleWhere(now) } });
  if (grants.length === 0) return [];
  const cache = new Map<string, ScopeOrganization | null>();
  const candidates = [...await organizationChain(db, baseOrganizationId, now, cache), ...await organizationChain(db, organizationId, now, cache)];
  // A valid grant in a second club/region is usable even if it is not the member's home.
  for (const grant of grants) {
    if (grant.scopeId && roleLevels[grant.role] === grant.scopeType) candidates.push(...await organizationChain(db, grant.scopeId, now, cache));
  }
  const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
  const options: EventPublishingOption[] = [];
  for (const scope of EVENT_SCOPES) {
    for (const organization of uniqueCandidates.filter((candidate) => candidate.level === scopeLevels[scope])) {
      if (grantsAuthorize(grants, scope, await organizationChain(db, organization.id, now, cache), now)) {
        options.push({ scope, hostOrganizationId: organization.id, hostOrganizationName: organization.name });
        break;
      }
    }
  }
  return options;
}

/** Must be invoked inside the same serializable transaction as create/update. */
export async function resolveEventPublication(db: ScopeDatabase, memberId: string, organizationId: string, input: { category: string; scope: string; hostOrganizationId?: string }, now = new Date()) {
  const actor = await db.member.findFirst({ where: { id: memberId, organizationId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
  if (!actor) throw new EventScopeError(409, "會籍或帳號已更新，請重新登入確認");
  if (input.category === "PERSONAL") {
    if (input.scope !== "CLUB") throw new EventScopeError(400, "個人活動不可設定官方發佈層級");
    if (input.hostOrganizationId && input.hostOrganizationId !== organizationId) throw new EventScopeError(403, "個人活動不可代表其他組織主辦");
    const chain = await organizationChain(db, organizationId, now);
    if (chain[0]?.level !== "club") throw new EventScopeError(403, "所屬分會未啟用，暫時無法發布活動");
    return { category: "PERSONAL", scope: "CLUB", hostOrganizationId: organizationId };
  }
  if (input.category !== "CLUB_OFFICIAL" || !EVENT_SCOPES.includes(input.scope as EventScope)) throw new EventScopeError(400, "活動類別或發佈層級不正確");
  const hostOrganizationId = input.hostOrganizationId ?? (await getEventPublishingOptions(db, memberId, organizationId, organizationId, now)).find((option) => option.scope === input.scope)?.hostOrganizationId;
  if (!hostOrganizationId || !(await canPublishOfficialEvent(db, memberId, input.scope, hostOrganizationId, now))) throw new EventScopeError(403, "沒有此主辦組織與發佈層級的官方活動權限");
  return { category: "CLUB_OFFICIAL", scope: input.scope, hostOrganizationId };
}
