import type { Prisma } from "@prisma/client";
import { getCurrentLionYearStart } from "./lion-year";
import { requireRosterConsent } from "./roster-consent";

type Database = Pick<Prisma.TransactionClient, "annualAppointment" | "organization" | "member" | "memberDataConsent">;

const CLUB_SUFFIX = "獅子會";

export function bareClubName(name: string) {
  const value = name.trim();
  return value.endsWith(CLUB_SUFFIX) ? value.slice(0, -CLUB_SUFFIX.length) : value;
}

export class RosterMatchError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

type Organization = { id: string; name: string; level: string; parentId: string | null; districtCode: string | null; isActive: boolean; validFrom: Date | null; validTo: Date | null };
const parentLevels: Record<string, string> = { club: "zone", zone: "region", region: "district", district: "md", md: "international" };
export function rosterAncestorIds(club: Organization, organizations: Organization[], now = new Date()): string[] | null {
  const byId = new Map(organizations.map(org => [org.id, org]));
  const ids = new Set<string>();
  let node: Organization | undefined = club;
  while (node) {
    if (ids.has(node.id) || ids.size > 16 || !node.isActive || node.validFrom && node.validFrom > now || node.validTo && node.validTo <= now) return null;
    ids.add(node.id);
    if (!node.parentId) return ["md", "international"].includes(node.level) ? [...ids] : null;
    const parent = byId.get(node.parentId);
    if (!parent || parent.level !== parentLevels[node.level]) return null;
    node = parent;
  }
  return null;
}

const organizationSelect = { id: true, name: true, level: true, parentId: true, districtCode: true, isActive: true, validFrom: true, validTo: true } as const;
const appointmentSelect = { id: true, positionName: true, listingNature: true, sourcePage: true, yearStart: true, organizationId: true,
  organization: { select: organizationSelect } } as const;
type Suggestion = Prisma.AnnualAppointmentGetPayload<{ select: typeof appointmentSelect }>;

/**
 * Consent is checked before any name lookup. Exact name + uniquely resolved home
 * club is only a suggestion, never identity verification or an account/role grant.
 * Source publication year is NOT a historical appointment's actual term.
 */
export async function findAnnualAppointmentSuggestions(
  db: Database,
  input: { memberId: string },
  now = new Date(),
) {
  await requireRosterConsent(db, input.memberId);
  const member = await db.member.findFirst({ where: { id: input.memberId, status: "ACTIVE", deletedAt: null }, select: {
    id: true, name: true, organizationId: true, organizationAssignmentStatus: true, declaredOrganizationName: true,
    organization: { select: organizationSelect },
  } });
  if (!member) throw new RosterMatchError(409, "ACCOUNT_CHANGED", "帳號狀態已更新，請重新登入確認。");
  const yearStart = getCurrentLionYearStart(now);
  const pending = member.organizationAssignmentStatus !== "ASSIGNED";
  const clubName = pending ? member.declaredOrganizationName?.trim() : member.organization.name;
  const empty = (matchStatus: string) => ({ matchStatus, sourceRosterYear: yearStart, candidatePending: pending, canImport: false, suggestions: [] as Suggestion[] });
  if (!clubName || !member.name.trim()) return empty(pending ? "pending_assignment" : "unresolved_organization");
  const bare = bareClubName(clubName);
  if (!bare) return empty("unresolved_organization");
  // Only removing the exact trailing club suffix is permitted. No fuzzy names,
  // 台/臺 substitutions, nicknames, telephone or nearest-organization matching.
  const aliases = [...new Set([bare, `${bare}${CLUB_SUFFIX}`])];
  const organizations = await db.organization.findMany({ select: organizationSelect });
  const clubs = organizations.filter(org => org.level === "club" && aliases.includes(org.name));
  if (clubs.length !== 1 || !pending && clubs[0].id !== member.organizationId) return empty("ambiguous_organization");
  const club = clubs[0];
  const allowedIds = rosterAncestorIds(club, organizations, now);
  if (!allowedIds) return empty("unresolved_hierarchy");
  const sameNameAccounts = await db.member.count({ where: { id: { not: member.id }, status: "ACTIVE", deletedAt: null, name: member.name,
    OR: [{ organizationAssignmentStatus: "ASSIGNED", organizationId: club.id },
      { organizationAssignmentStatus: "NEEDS_ASSIGNMENT", declaredOrganizationName: { in: aliases } }],
  } });
  if (sameNameAccounts) return empty("ambiguous_identity");
  const suggestions = await db.annualAppointment.findMany({
    where: {
      yearStart,
      personName: member.name,
      homeClubSourceName: { in: aliases },
      claimedByExperience: null,
    },
    select: appointmentSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 101,
  });
  if (suggestions.length > 100 || suggestions.some(row => !allowedIds.includes(row.organizationId) ||
    !["現任職務", "歷任列載", "榮譽列載"].includes(row.listingNature))) return empty("ambiguous_source_scope");
  const signatures = suggestions.map(row => JSON.stringify([row.organizationId, row.positionName, row.listingNature, row.yearStart]));
  if (new Set(signatures).size !== signatures.length) return empty("ambiguous_source_rows");
  return { matchStatus: pending ? "pending_assignment" : suggestions.length ? "matched" : "no_match", sourceRosterYear: yearStart,
    candidatePending: pending, canImport: !pending, suggestions };
}
