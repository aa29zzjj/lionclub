// Client-safe navigation hints only. Every API still enforces scope and live roles.
// Keep separate lists: experience-only review is not administrative authority.
const memberReviewRoles = ["CLUB_OFFICER", "CLUB_VICE_PRESIDENT", "CLUB_PRESIDENT", "CLUB_FINANCE", "ZONE_ADMIN", "REGION_ADMIN", "DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"];
const experienceReviewRoles = [...memberReviewRoles, "DISTRICT_GOVERNOR", "DISTRICT_SECRETARY", "DISTRICT_CABINET"];
const inviteRoles = ["CLUB_OFFICER", "CLUB_VICE_PRESIDENT", "CLUB_PRESIDENT", "CLUB_FINANCE", "ZONE_ADMIN", "DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"];
const managementRoles = ["CLUB_PRESIDENT", "ZONE_ADMIN", "DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"];

export function profileCapabilities(roles: ReadonlyArray<{ role: string }>) {
  const names = new Set(roles.map(entry => entry.role));
  const has = (allowed: readonly string[]) => allowed.some(role => names.has(role));
  return {
    reviewExperiences: has(experienceReviewRoles),
    reviewMembers: has(memberReviewRoles),
    issueInvites: has(inviteRoles),
    manageRoles: has(managementRoles),
    assignMembers: has(managementRoles),
    reviewReports: names.has("SUPER_ADMIN"),
  };
}
