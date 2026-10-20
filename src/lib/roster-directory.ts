import { rosterAncestorIds } from "./annual-appointment-match";

export const ROSTER_DIRECTORY_DISCLOSURE_VERSION = "2026-10-20";
type Organization = Parameters<typeof rosterAncestorIds>[0];

/** Owner-controlled disclosure approval is separate from viewer matching consent. */
export function rosterDirectoryEligibility(
  member: { organizationAssignmentStatus: string; organization: Organization },
  organizations: Organization[],
  configuredVersion = process.env.ROSTER_DIRECTORY_DISCLOSURE_VERSION,
  now = new Date(),
) {
  if (configuredVersion !== ROSTER_DIRECTORY_DISCLOSURE_VERSION) return { status: "approval_required", organizationIds: [] as string[] };
  if (member.organizationAssignmentStatus !== "ASSIGNED" || member.organization.level !== "club") return { status: "membership_scope_unconfirmed", organizationIds: [] as string[] };
  const organizationIds = rosterAncestorIds(member.organization, organizations, now);
  return organizationIds ? { status: "scoped", organizationIds } : { status: "hierarchy_unconfirmed", organizationIds: [] as string[] };
}

export function safeDirectoryLabel(value: string, max: number) {
  return !!value.trim() && value.length <= max && !/[\r\n\0]/.test(value) &&
    !/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(value) && !/(?:\+?886[-\s]?9|09)(?:[-\s]?\d){8}/.test(value) && !/電話|手機|email|e-mail/i.test(value);
}
