import assert from "node:assert/strict";
import { test } from "node:test";
import type { PendingExperience, RolesResponse } from "../mobile-app/src/contract";
import {
  createAdminRequestGuard, existingRoleGrants, grantableMembers, grantableRoles,
  validateExperienceReview, validateRoleGrant, validateRoleRevoke,
} from "../mobile-app/src/admin-actions";

const now = Date.parse("2026-11-07T00:00:00.000Z");
function fixture(level = "club"): RolesResponse {
  const organization = { id: "org-a", name: "合成組織", level, districtCode: null };
  return {
    organization, organizations: [organization, { ...organization, id: "org-b" }],
    assignableRoles: level === "club" ? ["CLUB_OFFICER", "CLUB_FINANCE"] : ["DISTRICT_GOVERNOR", "DISTRICT_GMT_COORDINATOR"],
    members: [
      { id: "actor", name: "合成管理者", email: null, title: null, eligibleForGrant: true, adminRoles: [{ id: "self-role", role: level === "club" ? "CLUB_OFFICER" : "DISTRICT_GOVERNOR", validFrom: "2026-01-01T00:00:00.000Z", validUntil: null }] },
      { id: "eligible", name: "合成啟用會員", email: null, title: null, eligibleForGrant: true, adminRoles: [] },
      { id: "retained", name: "合成已移出會員", email: null, title: null, eligibleForGrant: false, adminRoles: [{ id: "retained-role", role: level === "club" ? "CLUB_FINANCE" : "DISTRICT_GOVERNOR", validFrom: "2026-01-01T00:00:00.000Z", validUntil: null }] },
    ],
  };
}
const draft = { organizationId: "org-a", memberId: "eligible", role: "CLUB_FINANCE", validUntilDate: "" };
const item: PendingExperience = { id: "experience", member: { id: "member", name: "合成會員" }, review: { label: "合成審核資格", requiresReason: false }, updatedAt: "2026-11-07T00:00:00.000Z" };

test("grant candidates exclude self and ineligible holders, while revocation retains all existing grants", () => {
  const data = fixture();
  assert.deepEqual(grantableMembers(data, "actor").map(member => member.id), ["eligible"]);
  assert.deepEqual(existingRoleGrants(data).map(entry => entry.grant.id), ["self-role", "retained-role"]);
  assert.equal(validateRoleRevoke(data, "actor", "org-a", "retained-role").member.id, "retained");
  assert.throws(() => validateRoleRevoke(data, "actor", "org-a", "self-role"), /自己/);
  assert.throws(() => validateRoleRevoke(data, "actor", "org-b", "retained-role"), /組織/);
  assert.throws(() => validateRoleRevoke(data, "actor", "org-a", "unknown-role"), /變更/);
});

test("grant choices never expand the API role list or permit another scope level or SUPER", () => {
  const data = fixture();
  data.assignableRoles.push("SUPER_ADMIN", "DISTRICT_GOVERNOR", "CLUB_UNKNOWN", "toString");
  assert.deepEqual(grantableRoles(data), ["CLUB_OFFICER", "CLUB_FINANCE"]);
  for (const role of ["SUPER_ADMIN", "DISTRICT_GOVERNOR", "CLUB_UNKNOWN", "CLUB_PRESIDENT", "toString"]) {
    assert.throws(() => validateRoleGrant(data, "actor", { ...draft, role }, now), /允許/);
  }
});

test("grant validation fails closed for self, ineligible members, stale organizations and duplicate grants", () => {
  const data = fixture();
  for (const memberId of ["actor", "retained", "missing"]) assert.throws(() => validateRoleGrant(data, "actor", { ...draft, memberId }, now), /其他啟用會員/);
  assert.throws(() => validateRoleGrant(data, "actor", { ...draft, organizationId: "org-b" }, now), /組織已變更/);
  assert.throws(() => validateRoleGrant({ ...data, organizations: [] }, "actor", draft, now), /組織已變更/);
  data.members[1].adminRoles.push({ id: "duplicate", role: "CLUB_FINANCE", validFrom: "2027-01-01T00:00:00.000Z", validUntil: null });
  assert.throws(() => validateRoleGrant(data, "actor", draft, now), /相同有效或待生效/);
});

test("club grants can omit expiry and convert a selected inclusive Taiwan date to an exact UTC instant", () => {
  assert.equal(validateRoleGrant(fixture(), "actor", draft, now).validUntil, undefined);
  assert.equal(validateRoleGrant(fixture(), "actor", { ...draft, validUntilDate: "2026-11-08" }, now).validUntil, "2026-11-08T15:59:59.999Z");
});

test("expiry rejects invalid calendar dates, timestamps and past dates without silently normalizing", () => {
  for (const validUntilDate of ["2026-02-30", "2026-13-01", "2026-11-08T00:00:00Z", "not-date", "2026-11-06"]) {
    assert.throws(() => validateRoleGrant(fixture(), "actor", { ...draft, validUntilDate }, now), /日期|晚於/);
  }
  assert.equal(validateRoleGrant(fixture(), "actor", { ...draft, validUntilDate: "2028-02-29" }, now).validUntil, "2028-02-29T15:59:59.999Z");
});

test("district review grants require a future expiry within the API's 366 day boundary", () => {
  const data = fixture("district");
  const districtDraft = { ...draft, role: "DISTRICT_GMT_COORDINATOR" };
  assert.throws(() => validateRoleGrant(data, "actor", districtDraft, now), /366/);
  assert.throws(() => validateRoleGrant(data, "actor", { ...districtDraft, validUntilDate: "2027-11-08" }, now), /366/);
  assert.equal(validateRoleGrant(data, "actor", { ...districtDraft, validUntilDate: "2027-11-07" }, now).validUntil, "2027-11-07T15:59:59.999Z");
  const atBoundary = Date.parse("2027-11-08T15:59:59.999Z") - 366 * 86_400_000;
  assert.doesNotThrow(() => validateRoleGrant(data, "actor", { ...districtDraft, validUntilDate: "2027-11-08" }, atBoundary));
  assert.throws(() => validateRoleGrant(data, "actor", { ...districtDraft, validUntilDate: "2027-11-08" }, atBoundary - 1), /366/);
});

test("ordinary verification can omit a reason, while rejection and exception verification require a concrete reason", () => {
  assert.equal(validateExperienceReview(item, "verify", "  ").reason, undefined);
  for (const reason of ["", " ", "一", " 一 "]) {
    assert.throws(() => validateExperienceReview(item, "reject", reason), /至少 2 字/);
    assert.throws(() => validateExperienceReview({ ...item, review: { ...item.review, requiresReason: true } }, "verify", reason), /至少 2 字/);
  }
  assert.equal(validateExperienceReview(item, "reject", "  年度資料不符，請附佐證  ").reason, "年度資料不符，請附佐證");
  assert.equal(validateExperienceReview(item, "verify", "證".repeat(1000)).reason?.length, 1000);
  assert.throws(() => validateExperienceReview(item, "verify", "證".repeat(1001)), /1,000/);
});

test("experience review preserves the confirmed version and rejects changed or invalid versions", () => {
  assert.equal(validateExperienceReview(item, "reject", "年度不符").expectedUpdatedAt, item.updatedAt);
  assert.throws(() => validateExperienceReview({ ...item, updatedAt: "2026-11-07T01:00:00.000Z" }, "verify", "", item.updatedAt), /版本已變更/);
  assert.throws(() => validateExperienceReview({ ...item, updatedAt: "bad-date" }, "verify", ""), /版本已變更/);
});

test("organization loader ignores an older success or failure after a new request, and invalidates on unmount", async () => {
  const guard = createAdminRequestGuard();
  const rendered: string[] = [];
  let finishOld!: () => void;
  const oldRequest = guard.begin();
  const old = new Promise<void>(resolve => { finishOld = resolve; }).then(() => { if (guard.isCurrent(oldRequest)) rendered.push("old-organization"); });
  const newRequest = guard.begin();
  if (guard.isCurrent(newRequest)) rendered.push("new-organization");
  finishOld(); await old;
  assert.deepEqual(rendered, ["new-organization"]);
  assert.equal(guard.isCurrent(oldRequest), false);
  guard.invalidate();
  assert.equal(guard.isCurrent(newRequest), false);
});
