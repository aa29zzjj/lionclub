import assert from "node:assert/strict";
import { test } from "node:test";
import { EXPERIENCE_REVIEW_MATRIX, experienceReviewCandidateWhere, experienceReviewDecision, type ExperienceReviewContext, type ReviewGrant, type ReviewOrganization, type ReviewTarget } from "../src/lib/experience-review";
import { currentExperienceLabel, formatLionsYear, isVerifiedCurrentPosition, positionOptions, shortPositionLabel, type MemberExperience } from "../src/lib/experience-data";

const now = new Date("2026-10-15T00:00:00Z");
const past = new Date("2020-01-01"), future = new Date("2100-01-01");
const org = (id: string, level: string, parentId: string | null): ReviewOrganization => ({ id, name: id, level, parentId, districtCode: "300A-1", isActive: true, validFrom: null, validTo: null });
const organizations = [org("md", "md", null), org("district", "district", "md"), org("region", "region", "district"), org("zone", "zone", "region"), org("club", "club", "zone"), org("other-club", "club", "zone")];
const grant = (role: string, scopeId: string | null, scopeType = organizations.find(item => item.id === scopeId)?.level ?? "GLOBAL"): ReviewGrant => ({ role, scopeId, scopeType, validFrom: past, validUntil: null });
const context = (...roles: ReviewGrant[]): ExperienceReviewContext => ({ actorId: "reviewer", roles, organizations, now });
const target = (positionCode = "club_secretary", level = "club", kind = "position"): ReviewTarget => ({ memberId: "subject", kind, level, positionCode, organizationId: level, organizationName: level, districtCode: "300A-1" });

test("each explicit matrix row accepts only its configured direct reviewer scope", () => {
  for (const rule of EXPERIENCE_REVIEW_MATRIX) {
    const row = target(rule.codes[0], rule.level, rule.kind);
    assert.equal(experienceReviewDecision(context(grant(rule.roles[0], rule.scopeLevel)), row).allowed, true, rule.label);
    assert.equal(experienceReviewDecision(context(grant(rule.roles[0], "other-club", rule.scopeLevel)), row).allowed, false, `wrong scope: ${rule.label}`);
    for (const code of rule.codes) if (code !== "membership_joined") {
      assert.ok(positionOptions.some(option => option.code === code && option.kind === rule.kind && option.level === rule.level), `catalog matches ${code}`);
    }
  }
});

test("district roles never imply blanket descendant or all-cabinet review authority", () => {
  assert.equal(experienceReviewDecision(context(grant("DISTRICT_ADMIN", "district")), target()).allowed, false);
  assert.equal(experienceReviewDecision(context(grant("DISTRICT_GOVERNOR", "district")), target("club_president")).allowed, false);
  assert.equal(experienceReviewDecision(context(grant("DISTRICT_SECRETARY", "district")), target("zone_chair", "zone")).allowed, false);
  assert.equal(experienceReviewDecision(context(grant("DISTRICT_CABINET", "district")), target("dist_gmt_coordinator", "district")).allowed, false);
  assert.equal(experienceReviewDecision(context(grant("DISTRICT_SECRETARY", "district")), target("dist_gmt_coordinator", "district")).allowed, true);
  assert.equal(experienceReviewDecision(context(grant("DISTRICT_CABINET", "district")), target("dist_treasurer", "district")).allowed, false);
  assert.equal(experienceReviewDecision(context(grant("DISTRICT_CABINET", "district")), target("dist_secretary", "district")).allowed, false);
  assert.equal(experienceReviewDecision(context(grant("CLUB_PRESIDENT", "club")), target("club_president")).allowed, false);
});

test("only a separate effective GMT grant reviews the directly attached region chair", () => {
  const chair = target("region_chair", "region");
  for (const role of ["DISTRICT_ADMIN", "DISTRICT_GOVERNOR", "DISTRICT_SECRETARY", "DISTRICT_CABINET", "DISTRICT_GLT_COORDINATOR", "DISTRICT_GST_COORDINATOR", "MULTIDISTRICT_ADMIN"]) assert.equal(experienceReviewDecision(context(grant(role, "district")), chair).allowed, false, role);
  assert.equal(experienceReviewDecision(context(grant("DISTRICT_GMT_COORDINATOR", "district")), chair).allowed, true);
  assert.equal(experienceReviewDecision(context(grant("DISTRICT_GMT_COORDINATOR", "region", "district")), chair).allowed, false);
  assert.equal(experienceReviewDecision(context({ ...grant("DISTRICT_GMT_COORDINATOR", "district"), validUntil: now }), chair).allowed, false);
  assert.equal(experienceReviewDecision(context({ ...grant("DISTRICT_GMT_COORDINATOR", "district"), validFrom: future }), chair).allowed, false);
  assert.equal(experienceReviewDecision(context(grant("DISTRICT_GMT_COORDINATOR", "district")), target("zone_chair", "zone")).allowed, false);
  assert.equal(experienceReviewDecision(context(grant("DISTRICT_GMT_COORDINATOR", "district")), target("club_president")).allowed, false);
  const otherRegionPosition = target("region_secretary", "region");
  assert.equal(experienceReviewDecision(context(grant("DISTRICT_CABINET", "district")), otherRegionPosition).allowed, false);
  assert.equal(experienceReviewDecision(context(grant("DISTRICT_ADMIN", "district")), otherRegionPosition).allowed, true);
});

test("future, expired, null-scope and wrong-scope-type grants fail closed", () => {
  for (const role of [
    { ...grant("CLUB_PRESIDENT", "club"), validFrom: future },
    { ...grant("CLUB_PRESIDENT", "club"), validUntil: now },
    grant("CLUB_PRESIDENT", null, "club"), grant("CLUB_PRESIDENT", "club", "district"),
    grant("SUPER_ADMIN", null, "club"), grant("SUPER_ADMIN", "club", "GLOBAL"),
  ]) assert.equal(experienceReviewDecision(context(role), target()).allowed, false);
  assert.equal(experienceReviewDecision(context({ ...grant("CLUB_PRESIDENT", "club"), validFrom: now }), target()).allowed, true);
});

test("self-review is forbidden even for SUPER; special and unknown roles need audited SUPER reason", () => {
  const superContext = context(grant("SUPER_ADMIN", null));
  assert.equal(experienceReviewDecision(superContext, { ...target(), memberId: "reviewer" }).allowed, false);
  const unknown = { ...target(), positionCode: "not-in-policy" };
  assert.equal(experienceReviewDecision(context(grant("CLUB_PRESIDENT", "club")), unknown).allowed, false);
  const decision = experienceReviewDecision(superContext, unknown);
  assert.equal(decision.allowed, true); assert.equal(decision.requiresReason, true); assert.equal(decision.role, "SUPER_ADMIN");
});

test("exact organization identity matters, not subject current membership or a matching name alone", () => {
  const c = context(grant("CLUB_PRESIDENT", "club"));
  assert.equal(experienceReviewDecision(c, { ...target(), organizationId: null }).allowed, true);
  assert.equal(experienceReviewDecision(c, { ...target(), organizationName: "unlisted" }).allowed, false);
  const ambiguous = { ...c, organizations: [...organizations, { ...org("duplicate", "club", "zone"), name: "club" }] };
  assert.equal(experienceReviewDecision(ambiguous, { ...target(), organizationId: null }).allowed, false);
  assert.equal(experienceReviewDecision(ambiguous, target()).allowed, true);
  assert.equal(experienceReviewDecision(c, { ...target(), districtCode: "300B-1" }).allowed, false);
});

test("missing direct levels, inactive hierarchy and cycles do not widen review scope", () => {
  const zoneContext = context(grant("ZONE_ADMIN", "zone"));
  const missing = { ...zoneContext, organizations: organizations.map(item => item.id === "club" ? { ...item, parentId: "district" } : item) };
  assert.equal(experienceReviewDecision(missing, target("club_president")).allowed, false);
  const cycle = { ...zoneContext, organizations: organizations.map(item => item.id === "district" ? { ...item, parentId: "club" } : item) };
  assert.equal(experienceReviewDecision(cycle, target("club_president")).allowed, false);
  const inactive = { ...zoneContext, organizations: organizations.map(item => item.id === "region" ? { ...item, isActive: false } : item) };
  assert.equal(experienceReviewDecision(inactive, target("club_president")).allowed, false);
});

test("candidate query excludes self and inactive members, normal grants never get an unrestricted query", () => {
  const query = experienceReviewCandidateWhere(context(grant("CLUB_PRESIDENT", "club")));
  assert.deepEqual(query.memberId, { not: "reviewer" });
  assert.deepEqual(query.member, { status: "ACTIVE", deletedAt: null });
  assert.ok(Array.isArray(query.OR) && query.OR.length > 0);
  assert.deepEqual(experienceReviewCandidateWhere(context(grant("DISTRICT_ADMIN", null, "district"))).OR, []);
});

const experience: MemberExperience = { id: "exp", kind: "position", level: "club", positionCode: "club_secretary", positionName: "秘書", organizationName: "club", startYear: 2026, endYear: 2026, datePrecision: "lions-year", isCurrent: false, verificationStatus: "verified", visibility: "members" };
test("verified-year badge needs verified known position and July interval, not the current checkbox", () => {
  assert.equal(isVerifiedCurrentPosition(experience, now), true);
  assert.equal(isVerifiedCurrentPosition({ ...experience, isCurrent: true, verificationStatus: "under-review" }, now), false);
  assert.equal(isVerifiedCurrentPosition({ ...experience, startYear: 2025, endYear: 2025, isCurrent: true }, now), false);
  assert.equal(isVerifiedCurrentPosition({ ...experience, startYear: 2024, endYear: 2026 }, now), true);
  assert.equal(isVerifiedCurrentPosition({ ...experience, positionCode: "unknown" }, now), false);
  assert.equal(isVerifiedCurrentPosition({ ...experience, kind: "membership" }, now), false);
  assert.equal(isVerifiedCurrentPosition(experience, new Date("2026-06-30T15:59:59Z")), false);
  assert.equal(isVerifiedCurrentPosition(experience, new Date("2026-06-30T16:00:00Z")), true);
  assert.equal(currentExperienceLabel({ ...experience, verificationStatus: "under-review", isCurrent: true }, now), "本人標示現任（未核實）");
  assert.equal(currentExperienceLabel(experience, now), "本年度已核實職務");
});

test("founder/charter member and mentor/guiding lion remain distinct codes and labels", () => {
  const labels = ["club_founder", "club_charter_member", "club_mentor", "club_guiding_lion"].map(code => positionOptions.find(option => option.code === code)?.label);
  assert.deepEqual(labels, ["創會人", "創會會員", "導師", "導獅"]);
  assert.equal(new Set(positionOptions.map(option => option.code)).size, positionOptions.length);
});

test("stable office codes get clear canonical labels, vice abbreviations and historical years", () => {
  assert.equal(shortPositionLabel("club_vp1", "一副"), "第一副");
  assert.equal(shortPositionLabel("club_vp2", "二副"), "第二副");
  assert.equal(shortPositionLabel("club_founder_president", "舊標示"), "創會長（首屆會長）");
  assert.equal(shortPositionLabel("club_honor_president", "榮譽會長"), "分會榮譽會長");
  assert.equal(shortPositionLabel("dist_honor_vdg", "舊標示"), "榮譽副總監");
  assert.equal(shortPositionLabel("unknown", "自訂職務"), "自訂職務");
  const historical = { ...experience, startYear: 2024, endYear: 2025, isCurrent: true };
  assert.equal(currentExperienceLabel(historical, now), "歷任職務（已核實）");
  assert.match(formatLionsYear(historical), /2024.*2025.*2026/);
  assert.equal(isVerifiedCurrentPosition(historical, now), false);
});
