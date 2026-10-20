import type { Prisma, PrismaClient } from "@prisma/client";
import { EXPERIENCE_REVIEW_ROLES } from "./admin-scope";
import { activeAdminRoleWhere, isActiveAdminRole } from "./active-admin-role";

type Database = PrismaClient | Prisma.TransactionClient;
type Level = "club" | "zone" | "region" | "district" | "md" | "international" | "foundation";
type ReviewRule = { codes: readonly string[]; kind: string; level: Level; scopeLevel: Level; parent: boolean; roles: readonly string[]; label: string };

// Platform verification policy, not a membership directory or automatic grant.
// A parent means the IMMEDIATE stored parent; never skip a missing hierarchy tier.
export const EXPERIENCE_REVIEW_MATRIX: readonly ReviewRule[] = [
  { codes: ["membership_joined"], kind: "membership", level: "club", scopeLevel: "club", parent: false, roles: ["CLUB_PRESIDENT", "CLUB_VICE_PRESIDENT", "CLUB_OFFICER", "CLUB_FINANCE"], label: "本會有效幹部核對會籍" },
  { codes: ["club_vp1", "club_vp2", "club_secretary", "club_treasurer", "club_director", "club_supervisor", "club_service_chair", "club_pr_chair", "club_activity_director", "club_information"], kind: "position", level: "club", scopeLevel: "club", parent: false, roles: ["CLUB_PRESIDENT", "CLUB_VICE_PRESIDENT", "CLUB_OFFICER", "CLUB_FINANCE"], label: "本會有效幹部核實一般分會職務" },
  { codes: ["club_honor_president", "club_founder", "club_charter_member", "club_honor_founder"], kind: "honorary", level: "club", scopeLevel: "club", parent: false, roles: ["CLUB_PRESIDENT", "CLUB_VICE_PRESIDENT", "CLUB_OFFICER", "CLUB_FINANCE"], label: "本會有效幹部核實榮譽資歷" },
  { codes: ["club_guiding_lion", "club_mentor"], kind: "advisor", level: "club", scopeLevel: "club", parent: false, roles: ["CLUB_PRESIDENT", "CLUB_VICE_PRESIDENT", "CLUB_OFFICER", "CLUB_FINANCE"], label: "本會有效幹部核實導獅／導師資歷（兩者不同）" },
  { codes: ["club_president", "club_founder_president"], kind: "position", level: "club", scopeLevel: "zone", parent: true, roles: ["ZONE_ADMIN"], label: "直屬分區有效授權者核實會長" },
  { codes: ["zone_chair", "zone_secretary", "zone_treasurer"], kind: "position", level: "zone", scopeLevel: "region", parent: true, roles: ["REGION_ADMIN"], label: "直屬專區有效授權者核實分區職務" },
  { codes: ["zone_advisory"], kind: "advisor", level: "zone", scopeLevel: "region", parent: true, roles: ["REGION_ADMIN"], label: "直屬專區有效授權者核實分區顧問" },
  { codes: ["region_vice_chair", "region_secretary", "region_treasurer"], kind: "position", level: "region", scopeLevel: "district", parent: true, roles: ["DISTRICT_ADMIN", "DISTRICT_GOVERNOR"], label: "直屬區有效授權者核實專區職務" },
  // Platform policy 2026-10-20: only an explicitly granted GMT reviewer may verify
  // a directly attached region chair. Cabinet/GLT/GST/title/experience are not grants.
  { codes: ["region_chair"], kind: "position", level: "region", scopeLevel: "district", parent: true, roles: ["DISTRICT_GMT_COORDINATOR"], label: "直屬區有效 GMT 專用審核授權者核實專區主席" },
  { codes: ["region_advisor"], kind: "advisor", level: "region", scopeLevel: "district", parent: true, roles: ["DISTRICT_ADMIN", "DISTRICT_GOVERNOR"], label: "直屬區有效授權者核實專區顧問" },
  { codes: ["dist_deputy_secretary", "dist_treasurer", "dist_deputy_treasurer", "dist_general_affairs", "dist_pr_chair", "dist_information"], kind: "position", level: "district", scopeLevel: "district", parent: false, roles: ["DISTRICT_SECRETARY"], label: "同區秘書長核實區內閣職務" },
  { codes: ["dist_special_advisor"], kind: "advisor", level: "district", scopeLevel: "district", parent: false, roles: ["DISTRICT_SECRETARY"], label: "同區秘書長核實區特別顧問" },
  { codes: ["dist_gmt_coordinator", "dist_glt_coordinator", "dist_gst_coordinator"], kind: "position", level: "district", scopeLevel: "district", parent: false, roles: ["DISTRICT_SECRETARY"], label: "同區秘書長核實 GMT／GLT／GST 區內閣職務" },
  { codes: ["dist_secretary"], kind: "position", level: "district", scopeLevel: "district", parent: false, roles: ["DISTRICT_GOVERNOR"], label: "同區總監核實秘書長" },
  { codes: ["dist_governor", "dist_vdg1", "dist_vdg2"], kind: "position", level: "district", scopeLevel: "md", parent: true, roles: ["MULTIDISTRICT_ADMIN"], label: "直屬複合區有效授權者核實總監／副總監" },
  { codes: ["dist_honor_governor", "dist_honor_vdg"], kind: "honorary", level: "district", scopeLevel: "md", parent: true, roles: ["MULTIDISTRICT_ADMIN"], label: "直屬複合區有效授權者核實榮譽總監／副總監" },
];

export type ReviewOrganization = { id: string; name: string; level: string; parentId: string | null; districtCode: string | null; isActive: boolean; validFrom: Date | null; validTo: Date | null };
export type ReviewGrant = { role: string; scopeType: string; scopeId: string | null; validFrom: Date; validUntil: Date | null };
export type ReviewTarget = { memberId: string; kind: string; level: string; positionCode: string; organizationId?: string | null; organizationName: string; districtCode?: string | null };
export type ExperienceReviewContext = { actorId: string; roles: ReviewGrant[]; organizations: ReviewOrganization[]; organizationById?: ReadonlyMap<string, ReviewOrganization>; now: Date };
export class ExperienceReviewError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const rank: Record<string, number> = { international: 0, md: 1, district: 2, region: 3, zone: 4, club: 5 };
function activeOrganization(org: ReviewOrganization, now: Date) {
  return org.isActive && (!org.validFrom || org.validFrom <= now) && (!org.validTo || org.validTo > now);
}
function validHierarchy(org: ReviewOrganization, organizations: ReadonlyMap<string, ReviewOrganization>, now: Date) {
  const seen = new Set<string>();
  let current: ReviewOrganization | undefined = org;
  while (current) {
    if (seen.has(current.id) || seen.size > 32 || !activeOrganization(current, now)) return false;
    seen.add(current.id);
    if (!current.parentId) return true;
    const parent = organizations.get(current.parentId);
    if (!parent || rank[parent.level] === undefined || rank[current.level] === undefined || rank[parent.level] >= rank[current.level]) return false;
    current = parent;
  }
  return false;
}
function isGlobal(grant: ReviewGrant, now: Date) {
  return grant.role === "SUPER_ADMIN" && grant.scopeType === "GLOBAL" && grant.scopeId === null && isActiveAdminRole(grant, now);
}
function matchesGrant(grant: ReviewGrant, rule: ReviewRule, scope: ReviewOrganization, now: Date) {
  return rule.roles.includes(grant.role) && isActiveAdminRole(grant, now) && grant.scopeId === scope.id &&
    grant.scopeType === rule.scopeLevel && scope.level === rule.scopeLevel;
}
export function resolveExperienceOrganization(target: ReviewTarget, organizations: ReviewOrganization[]) {
  const matches = organizations.filter(org => org.level === target.level && org.name === target.organizationName.trim() &&
    (!target.organizationId || org.id === target.organizationId) &&
    (!target.districtCode || !["club", "zone", "region", "district"].includes(target.level) || org.districtCode === target.districtCode));
  return matches.length === 1 ? matches[0] : null;
}

export function experienceReviewDecision(context: ExperienceReviewContext, target: ReviewTarget) {
  if (target.memberId === context.actorId) return { allowed: false, requiresReason: false, label: "不得審核自己的資歷", role: null, scopeId: null, organizationId: null };
  const org = resolveExperienceOrganization(target, context.organizations);
  const byId = context.organizationById ?? new Map(context.organizations.map(item => [item.id, item]));
  const rule = EXPERIENCE_REVIEW_MATRIX.find(item => item.kind === target.kind && item.level === target.level && item.codes.includes(target.positionCode));
  if (org && rule && validHierarchy(org, byId, context.now)) {
    const scope = rule.parent ? byId.get(org.parentId ?? "") : org;
    const grant = scope && context.roles.find(item => matchesGrant(item, rule, scope, context.now));
    if (grant) return { allowed: true, requiresReason: false, label: rule.label, role: grant.role, scopeId: grant.scopeId, organizationId: org.id };
  }
  if (context.roles.some(grant => isGlobal(grant, context.now))) return {
    allowed: true, requiresReason: true, label: "SUPER 例外核對：須說明任職組織、職務及證明來源，並留存稽核",
    role: "SUPER_ADMIN", scopeId: null, organizationId: org?.id ?? null,
  };
  return { allowed: false, requiresReason: false, label: "無符合直接上一級的有效授權，或任職組織／階層尚待核對", role: null, scopeId: null, organizationId: null };
}

export async function loadExperienceReviewContext(db: Database, actorId: string, now = new Date()): Promise<ExperienceReviewContext> {
  if (!await db.member.findFirst({ where: { id: actorId, status: "ACTIVE", deletedAt: null }, select: { id: true } })) throw new ExperienceReviewError(403, "帳號狀態已變更，請重新登入");
  const roles = await db.adminRole.findMany({ where: { memberId: actorId, role: { in: EXPERIENCE_REVIEW_ROLES }, ...activeAdminRoleWhere(now) } });
  const organizations = await db.organization.findMany({ select: { id: true, name: true, level: true, parentId: true, districtCode: true, isActive: true, validFrom: true, validTo: true } });
  const validRoles = roles.filter(role => isGlobal(role, now) || !!role.scopeId && organizations.some(org => org.id === role.scopeId && org.level === role.scopeType.toLowerCase() && activeOrganization(org, now)));
  if (!validRoles.length) throw new ExperienceReviewError(403, "沒有有效的資歷審核授權與組織範圍；自填職稱不會產生管理權限");
  return { actorId, roles: validRoles, organizations, organizationById: new Map(organizations.map(org => [org.id, org])), now };
}

/** Narrow candidates in SQL, then apply the same pure decision as POST. */
export function experienceReviewCandidateWhere(context: ExperienceReviewContext): Prisma.MemberExperienceWhereInput {
  const base = { verificationStatus: "under_review" as const, memberId: { not: context.actorId }, member: { status: "ACTIVE", deletedAt: null } };
  if (context.roles.some(role => isGlobal(role, context.now))) return base;
  const alternatives: Prisma.MemberExperienceWhereInput[] = [];
  const byId = context.organizationById ?? new Map(context.organizations.map(item => [item.id, item]));
  for (const rule of EXPERIENCE_REVIEW_MATRIX) {
    const organizations = context.organizations.filter(org => org.level === rule.level && validHierarchy(org, byId, context.now) && context.roles.some(grant => {
      const scope = rule.parent ? byId.get(org.parentId ?? "") : org;
      return !!scope && matchesGrant(grant, rule, scope, context.now);
    }));
    if (!organizations.length) continue;
    alternatives.push({ kind: rule.kind as Prisma.MemberExperienceWhereInput["kind"], level: rule.level,
      positionCode: { in: [...rule.codes] }, OR: [{ organizationId: { in: organizations.map(org => org.id) } }, { organizationId: null, organizationName: { in: organizations.map(org => org.name) } }] });
  }
  return { ...base, OR: alternatives };
}

export async function reviewExperience(prisma: PrismaClient, input: { actorId: string; experienceId: string; action: "verify" | "reject"; expectedUpdatedAt: string; reason?: string }) {
  try {
    return await prisma.$transaction(async tx => {
      const context = await loadExperienceReviewContext(tx, input.actorId);
      const target = await tx.memberExperience.findUnique({ where: { id: input.experienceId }, include: { member: { select: { status: true, deletedAt: true } } } });
      if (!target || target.verificationStatus !== "under_review" || target.member.status !== "ACTIVE" || target.member.deletedAt) throw new ExperienceReviewError(404, "找不到此待審核資歷");
      const decision = experienceReviewDecision(context, target);
      if (!decision.allowed || !decision.role) throw new ExperienceReviewError(403, decision.label);
      if (+new Date(input.expectedUpdatedAt) !== +target.updatedAt) throw new ExperienceReviewError(409, "資歷內容已更新，請重新載入核對後再審核");
      const reason = input.reason?.trim() || null;
      if (reason && reason.length > 1000) throw new ExperienceReviewError(400, "審核理由最多 1000 字");
      if ((decision.requiresReason || input.action === "reject") && (!reason || reason.length < 2)) throw new ExperienceReviewError(400, "退回或 SUPER 例外審核需填寫至少 2 字的具體理由／證明來源");
      const changed = await tx.memberExperience.updateMany({ where: { id: target.id, updatedAt: target.updatedAt, verificationStatus: "under_review", member: { status: "ACTIVE", deletedAt: null } }, data: {
        verificationStatus: input.action === "verify" ? "verified" : "rejected", verifiedById: input.actorId, verifiedAt: context.now,
        rejectedReason: input.action === "reject" ? reason : null,
        ...(input.action === "verify" && decision.organizationId ? { organizationId: decision.organizationId } : {}),
      } });
      if (changed.count !== 1) throw new ExperienceReviewError(409, "資歷或會員狀態已更新，請重新載入");
      await tx.experienceReviewAudit.create({ data: { experienceId: target.id, actorId: input.actorId, action: input.action, reviewRole: decision.role, scopeId: decision.scopeId,
        reason, experienceUpdatedAt: target.updatedAt } });
      return { ok: true, status: input.action === "verify" ? "verified" : "rejected" };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && ["P2034", "P2025", "P2003"].includes(String(error.code))) throw new ExperienceReviewError(409, "資歷、授權或組織同時更新，請重新載入後再審核");
    throw error;
  }
}
