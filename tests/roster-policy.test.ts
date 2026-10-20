import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { bareClubName, findAnnualAppointmentSuggestions, rosterAncestorIds } from "../src/lib/annual-appointment-match";
import { readRosterConsent, updateRosterConsent } from "../src/lib/roster-consent";
import { rosterDirectoryEligibility, safeDirectoryLabel } from "../src/lib/roster-directory";

const org = (id: string, level: string, parentId: string | null) => ({ id, name: id, level, parentId, districtCode: null, isActive: true, validFrom: null as Date | null, validTo: null as Date | null });
const md = org("md", "md", null); const district = org("district", "district", "md");
const region = org("region", "region", "district"); const zone = org("zone", "zone", "region"); const club = org("club", "club", "zone");
const hierarchy = [club, zone, region, district, md];

test("only exact trailing club suffix is normalized; no fuzzy or 台臺 equivalence", () => {
  assert.equal(bareClubName("  合成獅子會  "), "合成");
  assert.equal(bareClubName("合成獅子會分處"), "合成獅子會分處");
  assert.notEqual(bareClubName("台合成獅子會"), bareClubName("臺合成獅子會"));
});

test("direct complete active hierarchy only; cycles, future/inactive/expired or skipped levels deny", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  assert.deepEqual(rosterAncestorIds(club, hierarchy, now), ["club", "zone", "region", "district", "md"]);
  for (const invalid of [{ ...zone, parentId: "club" }, { ...zone, parentId: "district" }, { ...zone, isActive: false },
    { ...zone, validFrom: new Date("2026-10-21") }, { ...zone, validTo: now }]) {
    assert.equal(rosterAncestorIds(club, hierarchy.map(node => node.id === "zone" ? invalid : node), now), null);
  }
  assert.equal(rosterAncestorIds({ ...club, parentId: null }, hierarchy, now), null);
});

test("consent is checked before any name, member or roster lookup", async () => {
  let accessedIdentity = false;
  const fake = { memberDataConsent: { findUnique: async () => null }, member: { findFirst: async () => { accessedIdentity = true; throw Error("must not read identity"); } } };
  await assert.rejects(() => findAnnualAppointmentSuggestions(fake as unknown as Parameters<typeof findAnnualAppointmentSuggestions>[0], { memberId: "synthetic" }), error => error instanceof Error && "code" in error && error.code === "ROSTER_CONSENT_REQUIRED");
  assert.equal(accessedIdentity, false);
});

test("missing schema and Serializable conflicts fail closed with recoverable explicit contracts", async () => {
  for (const code of ["P2021", "P2022"]) {
    const fake = { memberDataConsent: { findUnique: async () => { throw { code }; } } };
    await assert.rejects(() => readRosterConsent(fake as unknown as Parameters<typeof readRosterConsent>[0], "synthetic"), error => error instanceof Error && "code" in error && error.code === "ROSTER_CONSENT_UNAVAILABLE");
  }
  const fake = { $transaction: async () => { throw { code: "P2034" }; } };
  await assert.rejects(() => updateRosterConsent(fake as unknown as PrismaClient, "synthetic", true), error => error instanceof Error && "code" in error && error.code === "CONSENT_CHANGED");
});

test("owner disclosure gate is exact, independent and fails closed for unassigned members", () => {
  const assigned = { organizationAssignmentStatus: "ASSIGNED", organization: club };
  assert.deepEqual(rosterDirectoryEligibility(assigned, hierarchy, "false").organizationIds, []);
  assert.deepEqual(rosterDirectoryEligibility(assigned, hierarchy, "old").organizationIds, []);
  assert.deepEqual(rosterDirectoryEligibility(assigned, hierarchy, "2026-10-20").organizationIds, ["club", "zone", "region", "district", "md"]);
  assert.deepEqual(rosterDirectoryEligibility({ ...assigned, organizationAssignmentStatus: "NEEDS_ASSIGNMENT" }, hierarchy, "2026-10-20").organizationIds, []);
});

test("directory minimum labels reject embedded contacts or multiline payloads", () => {
  assert.equal(safeDirectoryLabel("合成主席", 100), true);
  for (const value of ["member@example.test", "0912-345-678", "+886 912345678", "電話待補", "主席\n其他欄位", ""]) assert.equal(safeDirectoryLabel(value, 100), false, value);
});
