import assert from "node:assert/strict";
import { test } from "node:test";
import { assignableRoleNames, canAdministerRoleOrganization, hasGlobalRoleAdministration, roleMemberOrganizationIds, type RoleAdministrationContext } from "../src/lib/admin-scope";

const now = new Date("2026-10-20T00:00:00Z");
const past = new Date("2020-01-01"), future = new Date("2100-01-01");
const org = (id: string, level: string, parentId: string | null) => ({ id, name: id, level, parentId, districtCode: "300A-1", isActive: true, validFrom: null, validTo: null });
const organizations = [org("md", "md", null), org("district", "district", "md"), org("region", "region", "district"), org("zone", "zone", "region"), org("club", "club", "zone"), org("district-b", "district", "md"), org("region-b", "region", "district-b"), org("zone-b", "zone", "region-b"), org("club-b", "club", "zone-b")];
const context = (role = "SUPER_ADMIN", scopeType = "GLOBAL", scopeId: string | null = null): RoleAdministrationContext => ({ roles: [{ role, scopeType, scopeId, validFrom: past, validUntil: null }], organizations, now });

test("only valid exact GLOBAL SUPER can configure district review-only roles", () => {
  assert.equal(canAdministerRoleOrganization(context(), "district"), true);
  for (const c of [context("DISTRICT_GOVERNOR", "district", "district"), context("DISTRICT_GMT_COORDINATOR", "district", "district"), context("DISTRICT_ADMIN", "district", "district"), context("SUPER_ADMIN", "club", "club"), context("SUPER_ADMIN", "GLOBAL", "md"), context("SUPER_ADMIN", "global", null)]) {
    assert.equal(hasGlobalRoleAdministration(c), false);
    assert.equal(canAdministerRoleOrganization(c, "district"), false);
  }
  for (const change of [{ validFrom: future }, { validUntil: now }]) {
    const c = context(); Object.assign(c.roles[0], change);
    assert.equal(canAdministerRoleOrganization(c, "district"), false);
  }
});

test("ordinary club role administration remains limited to exact active manager scope", () => {
  const chair = context("CLUB_PRESIDENT", "club", "club");
  assert.equal(canAdministerRoleOrganization(chair, "club"), true);
  assert.equal(canAdministerRoleOrganization(chair, "club-b"), false);
  assert.equal(canAdministerRoleOrganization(chair, "district"), false);
  assert.equal(canAdministerRoleOrganization(context("CLUB_PRESIDENT", "district", "district"), "club"), false);
  assert.equal(canAdministerRoleOrganization(context("ZONE_ADMIN", "zone", "zone"), "club"), true);
  assert.equal(canAdministerRoleOrganization(context("CLUB_FINANCE", "club", "club"), "club"), false);
});

test("eligible members stay in selected district, with complete active direct hierarchy", () => {
  assert.deepEqual(roleMemberOrganizationIds(context(), "district"), ["club"]);
  const c = context(); c.organizations = organizations.map(item => item.id === "club" ? { ...item, parentId: "district" } : item);
  assert.equal(canAdministerRoleOrganization(c, "club"), false);
  assert.deepEqual(roleMemberOrganizationIds(c, "district"), []);
  const inactive = context(); inactive.organizations = organizations.map(item => item.id === "region" ? { ...item, isActive: false } : item);
  assert.deepEqual(roleMemberOrganizationIds(inactive, "district"), []);
});

test("assignable review names exclude global/admin roles, and unsupported scope has no grants", () => {
  assert.ok(assignableRoleNames("district").includes("DISTRICT_GMT_COORDINATOR"));
  for (const role of ["SUPER_ADMIN", "DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "ZONE_ADMIN", "REGION_ADMIN"]) assert.equal(assignableRoleNames("district").includes(role), false);
  assert.equal(assignableRoleNames("club").includes("DISTRICT_GMT_COORDINATOR"), false);
  assert.deepEqual(assignableRoleNames("GLOBAL"), []);
  assert.deepEqual(assignableRoleNames("region"), []);
});
