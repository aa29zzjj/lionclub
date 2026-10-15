import assert from "node:assert/strict";
import { test } from "node:test";
import { profileCapabilities } from "../src/lib/profile-capabilities";
import { APPROVER_ROLES, EXPERIENCE_REVIEW_ROLES } from "../src/lib/admin-scope";

test("every backend experience-review role has a visible experience-review entry", () => {
  for (const role of EXPERIENCE_REVIEW_ROLES) assert.equal(profileCapabilities([{ role }]).reviewExperiences, true, role);
});

test("experience-only district offices cannot see invite, member or role administration", () => {
  for (const role of ["DISTRICT_GOVERNOR", "DISTRICT_SECRETARY", "DISTRICT_CABINET"]) {
    assert.deepEqual(profileCapabilities([{ role }]), { reviewExperiences: true, reviewMembers: false, issueInvites: false, manageRoles: false, assignMembers: false, reviewReports: false }, role);
  }
});

test("member-review and invite capabilities are separate, including REGION_ADMIN", () => {
  for (const role of APPROVER_ROLES) assert.equal(profileCapabilities([{ role }]).reviewMembers, true, role);
  const region = profileCapabilities([{ role: "REGION_ADMIN" }]);
  assert.equal(region.reviewExperiences, true); assert.equal(region.reviewMembers, true);
  assert.equal(region.issueInvites, false); assert.equal(region.manageRoles, false); assert.equal(region.assignMembers, false);
  assert.equal(profileCapabilities([{ role: "CLUB_FINANCE" }]).manageRoles, false);
});

test("ordinary/unknown roles get no administrative entry and combining roles does not lose grants", () => {
  const none = { reviewExperiences: false, reviewMembers: false, issueInvites: false, manageRoles: false, assignMembers: false, reviewReports: false };
  assert.deepEqual(profileCapabilities([]), none);
  assert.deepEqual(profileCapabilities([{ role: "會員自填總監" }, { role: "MEMBER" }]), none);
  const manager = profileCapabilities([{ role: "DISTRICT_CABINET" }, { role: "CLUB_PRESIDENT" }]);
  assert.equal(manager.reviewExperiences, true); assert.equal(manager.issueInvites, true); assert.equal(manager.manageRoles, true); assert.equal(manager.reviewReports, false);
  assert.ok(Object.values(profileCapabilities([{ role: "SUPER_ADMIN" }])).every(Boolean));
});
