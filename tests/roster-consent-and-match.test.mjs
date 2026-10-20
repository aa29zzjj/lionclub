import assert from "node:assert/strict";
import { test } from "node:test";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

const expect = (result, status) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
const PURPOSE = "annual_roster_match";
const VERSION = "2026-10-20";

// Actual application routes, helpers, Prisma and PostgreSQL SQL in isolated PGlite.
// Only sessions/mail adapters and synthetic seed data are substituted. This does
// not replace a real PostgreSQL multi-connection Serializable/race integration run.
test("optional, revocable roster consent and conservative draft matching", { timeout: 180000 }, async t => {
  const sim = await createSimulation();
  try {
    const s = await seedScenario(sim, "roster-consent");
    const md = await sim.prisma.organization.create({ data: { id: "roster-md", name: "合成複合區", level: "md" } });
    const district = await sim.prisma.organization.create({ data: { id: "roster-district", name: "合成區", level: "district", parentId: md.id } });
    const region = await sim.prisma.organization.create({ data: { id: "roster-region", name: "合成專區", level: "region", parentId: district.id } });
    const zone = await sim.prisma.organization.create({ data: { id: "roster-zone", name: "合成分區", level: "zone", parentId: region.id } });
    await sim.prisma.organization.updateMany({ where: { id: { in: [s.ai.id, s.other.id] } }, data: { parentId: zone.id } });
    await sim.prisma.organization.update({ where: { id: s.ai.id }, data: { name: "合成科技獅子會" } });
    await sim.prisma.member.update({ where: { id: s.member.id }, data: { name: "合成核對會員", organizationAssignmentStatus: "ASSIGNED", declaredOrganizationName: "不採用的自填分會" } });
    const now = new Date(); const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    const batch = await sim.prisma.rosterImportBatch.create({ data: { id: "roster-batch", sourceDigest: "synthetic-roster-digest", yearStart: year, approvedBy: "synthetic-owner", approvedAt: now, organizationCount: 6, appointmentCount: 5 } });
    const appointment = (id, extra = {}) => sim.prisma.annualAppointment.create({ data: { id, batchId: batch.id, sourceKey: id, yearStart: year, organizationId: s.ai.id,
      positionName: "會長", personName: "合成核對會員", homeClubSourceName: "合成科技", listingNature: "現任職務", sourcePage: "合成頁 1", approvedBy: "synthetic-owner", approvedAt: now, ...extra } });
    const current = await appointment("roster-current");
    const historical = await appointment("roster-history", { positionName: "原文特殊歷任職稱", listingNature: "歷任列載" });
    const honorary = await appointment("roster-honorary", { positionName: "原文榮譽職稱", listingNature: "榮譽列載" });
    await appointment("roster-ancestor", { organizationId: district.id, positionName: "合成區職務" });
    const jar = sim.jar();
    expect(await sim.call("/api/auth/login", "POST", { email: s.member.email, password: s.password }, jar), 200);
    const get = () => sim.call("/api/me/annual-appointment-suggestions", "GET", undefined, jar);
    const claim = (id, extra = {}, options) => sim.call("/api/me/annual-appointment-suggestions", "POST", { appointmentId: id, confirmOwnRecord: true, ...extra }, jar, options);
    const consent = (body, options) => sim.call("/api/me/roster-consent", "POST", body, jar, options);
    const accept = () => consent({ accepted: true, version: VERSION });

    await t.test("default deny, separate purpose/version, explicit action and browser origin", async () => {
      await sim.prisma.member.update({ where: { id: s.member.id }, data: { privacyConsentedAt: now, privacyConsentVersion: VERSION, termsAcceptedAt: now, termsVersion: VERSION } });
      assert.equal(expect(await sim.call("/api/me/roster-consent", "GET", undefined, jar), 200).accepted, false);
      await sim.prisma.memberDataConsent.create({ data: { memberId: s.member.id, purpose: "federated_auth", version: VERSION } });
      assert.equal(expect(await get(), 200).consentRequired, true);
      expect(await claim(current.id), 403);
      expect(await consent({ accepted: true }), 400);
      expect(await consent({ accepted: true, version: "old" }), 400);
      expect(await accept(), 200);
      expect(await consent({ accepted: false }, { origin: null }), 403);
      const first = expect(await sim.call("/api/me/roster-consent", "GET", undefined, jar), 200);
      const second = expect(await accept(), 200);
      assert.equal(first.acceptedAt, second.acceptedAt);
      assert.equal(await sim.prisma.memberDataConsent.count({ where: { memberId: s.member.id, purpose: PURPOSE } }), 1);
      expect(await claim(current.id, { confirmOwnRecord: false }), 400);
      expect(await claim(current.id, {}, { origin: null }), 403);
    });

    await t.test("exact name + actual club resolves direct ancestors and exposes only minimum fields", async () => {
      const result = expect(await get(), 200);
      assert.equal(result.matchStatus, "matched"); assert.equal(result.canImport, true);
      assert.equal(result.sourceRosterYear, year); assert.equal(result.suggestions.length, 4);
      assert.deepEqual(Object.keys(result.suggestions[0]).sort(), ["id", "listingNature", "organizationName", "positionName", "requiresActualYears", "sourcePage", "sourceRosterYear"].sort());
      assert.equal(JSON.stringify(result).includes("合成核對會員"), false);
      await sim.prisma.member.update({ where: { id: s.member.id }, data: { name: "合成核對會員近似" } });
      assert.equal(expect(await get(), 200).matchStatus, "no_match");
      await sim.prisma.member.update({ where: { id: s.member.id }, data: { name: "合成核對會員" } });
    });

    await t.test("unassigned declared club is candidate-only and no declared club never falls back to intake", async () => {
      await sim.prisma.member.update({ where: { id: s.member.id }, data: { organizationAssignmentStatus: "NEEDS_ASSIGNMENT", declaredOrganizationName: "合成科技獅子會" } });
      const pending = expect(await get(), 200);
      assert.equal(pending.matchStatus, "pending_assignment"); assert.equal(pending.candidatePending, true); assert.equal(pending.canImport, false); assert.equal(pending.suggestions.length, 4);
      expect(await claim(current.id), 409);
      await sim.prisma.member.update({ where: { id: s.member.id }, data: { declaredOrganizationName: null } });
      assert.equal(expect(await get(), 200).suggestions.length, 0);
      await sim.prisma.member.update({ where: { id: s.member.id }, data: { organizationAssignmentStatus: "ASSIGNED" } });
    });

    await t.test("duplicate organization, exact-name accounts, source rows and cross-scope sources fail closed", async () => {
      const duplicate = await sim.prisma.organization.create({ data: { id: "roster-duplicate-club", name: "合成科技", level: "club", parentId: zone.id } });
      assert.equal(expect(await get(), 200).matchStatus, "ambiguous_organization"); expect(await claim(current.id), 409);
      await sim.prisma.organization.delete({ where: { id: duplicate.id } });
      await sim.prisma.member.update({ where: { id: s.friend.id }, data: { name: "合成核對會員", organizationAssignmentStatus: "ASSIGNED" } });
      assert.equal(expect(await get(), 200).matchStatus, "ambiguous_identity");
      await sim.prisma.member.update({ where: { id: s.friend.id }, data: { name: "合成好友" } });
      await appointment("roster-duplicate-source");
      assert.equal(expect(await get(), 200).matchStatus, "ambiguous_source_rows");
      await sim.prisma.annualAppointment.delete({ where: { id: "roster-duplicate-source" } });
      await appointment("roster-cross-scope", { organizationId: s.other.id, positionName: "跨分會職務" });
      assert.equal(expect(await get(), 200).matchStatus, "ambiguous_source_scope"); expect(await claim(current.id), 409);
      await sim.prisma.annualAppointment.delete({ where: { id: "roster-cross-scope" } });
      await sim.prisma.organization.update({ where: { id: zone.id }, data: { parentId: s.ai.id } });
      assert.equal(expect(await get(), 200).matchStatus, "unresolved_hierarchy");
      await sim.prisma.organization.update({ where: { id: zone.id }, data: { parentId: region.id } });
    });

    await t.test("current import is private pending verification, preserves source and grants nothing", async () => {
      const users = await sim.prisma.user.count(); const roles = await sim.prisma.adminRole.count();
      expect(await claim(current.id, { actualStartYear: year - 1 }), 400);
      const imported = expect(await claim(current.id), 201).experience;
      const row = await sim.prisma.memberExperience.findUnique({ where: { id: imported.id } });
      assert.equal(row.positionCode, "club_president"); assert.equal(row.startYear, year); assert.equal(row.endYear, year);
      assert.equal(row.sourceAppointmentId, current.id); assert.equal(row.verificationStatus, "under_review"); assert.equal(row.visibility, "only_me");
      assert.equal(row.verifiedById, null); assert.equal(row.verifiedAt, null); assert.ok(row.note.includes("原文職稱「會長」"));
      assert.equal(await sim.prisma.user.count(), users); assert.equal(await sim.prisma.adminRole.count(), roles);
      expect(await claim(current.id), 404);
    });

    await t.test("historical/honorary publication year is never invented as actual term", async () => {
      expect(await claim(historical.id), 400);
      expect(await claim(historical.id, { actualStartYear: 2010, actualEndYear: 2012 }), 400);
      expect(await claim(historical.id, { actualStartYear: 2012, actualEndYear: 2010, confirmHistoricalYears: true }), 400);
      expect(await claim(historical.id, { actualStartYear: year + 1, actualEndYear: year + 1, confirmHistoricalYears: true }), 400);
      const result = expect(await claim(historical.id, { actualStartYear: 2010, actualEndYear: 2012, confirmHistoricalYears: true }), 201);
      const row = await sim.prisma.memberExperience.findUnique({ where: { id: result.experience.id } });
      assert.equal(row.startYear, 2010); assert.equal(row.endYear, 2012); assert.equal(row.positionCode, "原文特殊歷任職稱");
      assert.equal(row.isCurrent, false); assert.ok(row.note.includes(`${year}-${year + 1}`)); assert.ok(row.note.includes("歷任列載"));
      expect(await claim(honorary.id), 400);
      const honoraryRow = expect(await claim(honorary.id, { actualStartYear: 2020, actualEndYear: 2020, confirmHistoricalYears: true }), 201).experience;
      assert.equal(honoraryRow.kind, "honorary"); assert.equal(honoraryRow.startYear, 2020);
    });

    await t.test("withdrawal stops new matching/import, preserves own confirmed drafts and other purposes", async () => {
      await sim.prisma.memberDataConsent.create({ data: { memberId: s.member.id, purpose: PURPOSE, version: "older" } });
      const drafts = await sim.prisma.memberExperience.count({ where: { memberId: s.member.id } });
      assert.equal(expect(await consent({ accepted: false, purpose: "federated_auth" }), 200).accepted, false);
      assert.equal(await sim.prisma.memberDataConsent.count({ where: { memberId: s.member.id, purpose: PURPOSE } }), 0);
      assert.equal(await sim.prisma.memberDataConsent.count({ where: { memberId: s.member.id, purpose: "federated_auth" } }), 1);
      assert.equal(expect(await get(), 200).consentRequired, true); expect(await claim("roster-ancestor"), 403);
      assert.equal(await sim.prisma.memberExperience.count({ where: { memberId: s.member.id } }), drafts);
    });

    await t.test("missing optional consent table returns recoverable 503, core profile/manual experiences stay available", async () => {
      await sim.database.exec('ALTER TABLE "MemberDataConsent" RENAME TO "MemberDataConsentTemporarilyUnavailable"');
      // pglite-socket closes a connection after an undefined-table error. A fresh
      // local connection between negative requests avoids testing that adapter's
      // transport recovery instead of the real route's SQL error contract.
      const unavailable = async call => {
        try { return expect(await call(), 503); }
        finally { await sim.prisma.$disconnect(); await sim.prisma.$connect(); }
      };
      try {
        assert.equal((await unavailable(() => sim.call("/api/me/roster-consent", "GET", undefined, jar))).code, "ROSTER_CONSENT_UNAVAILABLE");
        assert.equal((await unavailable(get)).code, "ROSTER_CONSENT_UNAVAILABLE");
        await unavailable(accept); await unavailable(() => claim("roster-ancestor"));
        expect(await sim.call("/api/me", "GET", undefined, jar), 200);
        expect(await sim.call("/api/me/experiences", "GET", undefined, jar), 200);
        const freshJar = sim.jar();
        expect(await sim.call("/api/auth/login", "POST", { email: s.member.email, password: s.password }, freshJar), 200);
        const manual = expect(await sim.call("/api/me/experiences", "POST", { kind: "membership", level: "club", positionCode: "membership_joined", organizationName: "本人手填合成分會", startYear: 2020, startMonth: 6, datePrecision: "month", isCurrent: true, visibility: "only-me" }, freshJar), 201);
        expect(await sim.call(`/api/me/experiences/${manual.experience.id}`, "DELETE", undefined, freshJar), 200);
      } finally { await sim.database.exec('ALTER TABLE "MemberDataConsentTemporarilyUnavailable" RENAME TO "MemberDataConsent"'); }
      assert.equal(expect(await sim.call("/api/me/roster-consent", "GET", undefined, jar), 200).accepted, false);
      expect(await accept(), 200);
    });

    await t.test("directory names require owner gate, not viewer consent, and only own club/direct ancestors", async () => {
      await appointment("directory-sibling", { organizationId: s.other.id, personName: "合成旁支會員", homeClubSourceName: s.other.name });
      await appointment("directory-contact", { positionName: "聯絡電話 0912345678", personName: "不得揭露@example.test" });
      const tree = parentId => sim.call(`/api/organizations/tree?parentId=${parentId}`, "GET", undefined, jar);
      let data = expect(await tree(zone.id), 200);
      assert.equal(data.directory.status, "approval_required"); assert.ok(data.directory.message.includes("待營運者確認名冊揭露授權"));
      assert.ok(data.organizations.every(org => org.officers.length === 0));
      sim.env.ROSTER_DIRECTORY_DISCLOSURE_VERSION = VERSION;
      data = expect(await tree(zone.id), 200);
      const own = data.organizations.find(org => org.id === s.ai.id); const sibling = data.organizations.find(org => org.id === s.other.id);
      assert.ok(own.officers.length > 0); assert.equal(sibling.officers.length, 0); assert.equal(sibling.officerAccess, "out_of_scope");
      assert.ok(own.officers.every(row => Object.keys(row).sort().join() === ["listingNature", "personName", "positionName", "sourceRosterYear"].sort().join()));
      assert.equal(JSON.stringify(data).includes("不得揭露"), false);
      assert.ok(expect(await tree(md.id), 200).organizations.find(org => org.id === district.id).officers.length);
      await sim.database.exec('ALTER TABLE "AnnualAppointment" RENAME TO "AnnualAppointmentTemporarilyUnavailable"');
      try {
        const unavailable = expect(await tree(zone.id), 200);
        assert.equal(unavailable.directory.status, "unavailable"); assert.ok(unavailable.organizations.every(org => !org.officers.length));
      } finally {
        await sim.prisma.$disconnect();
        await sim.database.exec('ALTER TABLE "AnnualAppointmentTemporarilyUnavailable" RENAME TO "AnnualAppointment"');
        await sim.prisma.$connect();
      }
      await consent({ accepted: false });
      assert.ok(expect(await tree(zone.id), 200).organizations.find(org => org.id === s.ai.id).officers.length);
      await sim.prisma.member.update({ where: { id: s.member.id }, data: { organizationAssignmentStatus: "NEEDS_ASSIGNMENT" } });
      assert.ok(expect(await tree(zone.id), 200).organizations.every(org => org.officers.length === 0));
      delete sim.env.ROSTER_DIRECTORY_DISCLOSURE_VERSION;
    });
  } finally { await sim.close(); }
});
