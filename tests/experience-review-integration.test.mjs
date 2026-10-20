import assert from "node:assert/strict";
import { test } from "node:test";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

const check = (result, expected) => { assert.equal(result.status, expected, JSON.stringify(result.data)); return result.data; };
// Real routes/Prisma/migration SQL, isolated in-memory PGlite. Cookies/mail are
// test adapters. No real DB, AWS, roster identity matching or credential access.
test("direct experience review matrix and audit transaction over real isolated SQL", { timeout: 180000 }, async t => {
  const sim = await createSimulation();
  try {
    const s = await seedScenario(sim, "review");
    const md = await sim.prisma.organization.create({ data: { name: "300A 複合區", level: "md", code: "300A" } });
    const district = await sim.prisma.organization.create({ data: { name: "300A-1 區", level: "district", districtCode: "300A-1", parentId: md.id } });
    const region = await sim.prisma.organization.create({ data: { name: "合成專區", level: "region", districtCode: "300A-1", parentId: district.id } });
    const zone = await sim.prisma.organization.create({ data: { name: "合成分區", level: "zone", districtCode: "300A-1", parentId: region.id } });
    const otherZone = await sim.prisma.organization.create({ data: { name: "另一分區", level: "zone", districtCode: "300A-1", parentId: region.id } });
    await sim.prisma.organization.updateMany({ where: { id: { in: [s.ai.id, s.other.id] } }, data: { parentId: zone.id } });
    const jar = sim.jar(); check(await sim.call("/api/auth/login", "POST", { email: s.chair.email, password: s.password }, jar), 200);
    const grant = async (role, org, extra = {}) => {
      await sim.prisma.adminRole.deleteMany({ where: { memberId: s.chair.id } });
      return sim.prisma.adminRole.create({ data: { memberId: s.chair.id, role, scopeType: org?.level ?? "GLOBAL", scopeId: org?.id ?? null, ...extra } });
    };
    const experience = (code, org = s.ai, extra = {}) => sim.prisma.memberExperience.create({ data: {
      memberId: s.member.id, kind: "position", level: org.level, positionCode: code,
      organizationId: org.id, organizationName: org.name, districtCode: org.districtCode,
      startYear: 2026, endYear: 2026, datePrecision: "lions_year", isCurrent: true, verificationStatus: "under_review", ...extra,
    } });
    const path = row => `/api/admin/pending-experiences/${row.id}`;
    const review = (row, extra = {}) => sim.call(path(row), "POST", { action: "verify", expectedUpdatedAt: row.updatedAt.toISOString(), ...extra }, jar);
    const list = async () => check(await sim.call("/api/admin/pending-experiences", "GET", undefined, jar), 200).experiences;
    await t.test("club reviewer sees only own-club eligible positions, not self or president; no automatic AdminRole", async () => {
      await grant("CLUB_PRESIDENT", s.ai);
      const secretary = await experience("club_secretary", s.ai, { organizationId: null });
      const president = await experience("club_president");
      const self = await experience("club_secretary", s.ai, { memberId: s.chair.id });
      const other = await experience("club_secretary", s.other);
      await sim.prisma.member.update({ where: { id: s.member.id }, data: { organizationId: s.other.id } });
      const rows = await list();
      assert.ok(rows.some(row => row.id === secretary.id));
      for (const row of [president, self, other]) assert.equal(rows.some(item => item.id === row.id), false);
      check(await review(president), 403); check(await review(self), 403); check(await review(other), 403);
      check(await review(secretary, { expectedUpdatedAt: "2000-01-01T00:00:00Z" }), 409);
      check(await review(secretary), 200);
      const saved = await sim.prisma.memberExperience.findUnique({ where: { id: secretary.id } });
      assert.equal(saved.organizationId, s.ai.id); assert.equal(saved.verifiedById, s.chair.id);
      const audit = await sim.prisma.experienceReviewAudit.findFirst({ where: { experienceId: secretary.id } });
      assert.equal(audit.reviewRole, "CLUB_PRESIDENT"); assert.equal(audit.scopeId, s.ai.id);
      assert.equal(audit.experienceUpdatedAt.toISOString(), secretary.updatedAt.toISOString());
      assert.equal(await sim.prisma.adminRole.count({ where: { memberId: s.member.id } }), 0);
    });
    await t.test("each parent tier and district-specific team uses its exact configured grant", async () => {
      for (const [code, org, role, scope] of [
        ["club_president", s.ai, "ZONE_ADMIN", zone],
        ["zone_chair", zone, "REGION_ADMIN", region],
        ["region_chair", region, "DISTRICT_GMT_COORDINATOR", district],
        ["dist_treasurer", district, "DISTRICT_SECRETARY", district],
        ["dist_secretary", district, "DISTRICT_GOVERNOR", district],
        ["dist_governor", district, "MULTIDISTRICT_ADMIN", md],
        ["dist_gmt_coordinator", district, "DISTRICT_SECRETARY", district],
      ]) {
        await grant(role, scope);
        const row = await experience(code, org);
        assert.ok((await list()).some(item => item.id === row.id), code);
        check(await review(row), 200);
        assert.equal((await sim.prisma.experienceReviewAudit.findFirst({ where: { experienceId: row.id } })).reviewRole, role);
      }
      await grant("DISTRICT_CABINET", district);
      check(await review(await experience("dist_treasurer", district)), 403);
      await grant("DISTRICT_ADMIN", district);
      check(await review(await experience("club_president")), 403);
    });
    await t.test("GMT is separate from CABINET/GLT/GST; heads cannot skip the declared direct chain", async () => {
      const chair = await experience("region_chair", region);
      for (const role of ["DISTRICT_CABINET", "DISTRICT_GOVERNOR", "DISTRICT_ADMIN", "DISTRICT_SECRETARY", "DISTRICT_GLT_COORDINATOR", "DISTRICT_GST_COORDINATOR"]) {
        await grant(role, district);
        check(await review(chair), 403);
      }
      await sim.prisma.adminRole.deleteMany({ where: { memberId: s.chair.id } });
      await sim.prisma.member.update({ where: { id: s.chair.id }, data: { title: "GMT 協調長" } });
      check(await review(chair), 403);
      await grant("DISTRICT_GMT_COORDINATOR", district);
      const rows = await list(); assert.ok(rows.some(row => row.id === chair.id));
      check(await review(await experience("zone_chair", zone)), 403);
      check(await review(await experience("club_president")), 403);
      check(await review(chair), 200);
      assert.equal((await sim.prisma.experienceReviewAudit.findFirst({ where: { experienceId: chair.id } })).reviewRole, "DISTRICT_GMT_COORDINATOR");
      await grant("DISTRICT_GOVERNOR", district);
      check(await review(await experience("dist_treasurer", district)), 403);
      await grant("DISTRICT_CABINET", district);
      check(await review(await experience("dist_gmt_coordinator", district)), 403);
    });
    await t.test("revoked/future/expired or malformed grants cannot review a previously loaded row", async () => {
      const row = await experience("club_secretary");
      await grant("CLUB_PRESIDENT", s.ai);
      assert.ok((await list()).some(item => item.id === row.id));
      await sim.prisma.adminRole.deleteMany({ where: { memberId: s.chair.id } });
      check(await review(row), 403);
      for (const data of [
        { validFrom: new Date("2100-01-01") }, { validUntil: new Date("2020-01-01") },
        { scopeId: null }, { scopeType: "district" },
      ]) {
        await grant("CLUB_PRESIDENT", s.ai, data);
        check(await sim.call("/api/admin/pending-experiences", "GET", undefined, jar), 403);
        check(await review(row), 403);
      }
      assert.equal(await sim.prisma.experienceReviewAudit.count({ where: { experienceId: row.id } }), 0);
    });
    await t.test("wrong parent, missing hierarchy, cycle and duplicate organization names fail closed", async () => {
      const row = await experience("club_president");
      await grant("ZONE_ADMIN", otherZone); check(await review(row), 403);
      await grant("ZONE_ADMIN", zone);
      await sim.prisma.organization.update({ where: { id: s.ai.id }, data: { parentId: district.id } });
      check(await review(row), 403);
      await sim.prisma.organization.update({ where: { id: s.ai.id }, data: { parentId: zone.id } });
      await sim.prisma.organization.update({ where: { id: district.id }, data: { parentId: s.ai.id } });
      check(await review(row), 403);
      await sim.prisma.organization.update({ where: { id: district.id }, data: { parentId: md.id } });
      await grant("CLUB_PRESIDENT", s.ai);
      const ambiguous = await experience("club_secretary", s.ai, { organizationId: null });
      const duplicate = await sim.prisma.organization.create({ data: { name: s.ai.name, level: "club", districtCode: "300A-1", parentId: zone.id } });
      assert.equal((await list()).some(item => item.id === ambiguous.id), false);
      check(await review(ambiguous), 403);
      await sim.prisma.organization.delete({ where: { id: duplicate.id } });
    });
    await t.test("SUPER exception requires reason and global grant, never self, and leaves audit", async () => {
      const unknown = await experience("unknown-historical-office", s.ai, { organizationId: null, organizationName: "合成未知組織" });
      await grant("SUPER_ADMIN", s.ai, { scopeType: "GLOBAL" }); check(await review(unknown, { reviewReason: "核對合成證明" }), 403);
      await grant("SUPER_ADMIN", null);
      assert.equal((await list()).find(item => item.id === unknown.id).review.requiresReason, true);
      check(await review(unknown), 400);
      check(await review(unknown, { reviewReason: "核對合成證明來源與歷史組織" }), 200);
      const audit = await sim.prisma.experienceReviewAudit.findFirst({ where: { experienceId: unknown.id } });
      assert.equal(audit.reviewRole, "SUPER_ADMIN"); assert.match(audit.reason, /合成證明/);
      const self = await experience("club_secretary", s.ai, { memberId: s.chair.id });
      check(await review(self, { reviewReason: "本人仍然不得自審" }), 403);
    });
    await t.test("mandatory version, reject reason and CAS protect concurrent member edits", async () => {
      await grant("CLUB_PRESIDENT", s.ai);
      const row = await experience("club_secretary");
      check(await sim.call(path(row), "POST", { action: "verify" }, jar), 400);
      check(await review(row, { action: "reject" }), 400);
      await sim.prisma.memberExperience.update({ where: { id: row.id }, data: { note: "會員剛修改", updatedAt: new Date(row.updatedAt.getTime() + 1000) } });
      check(await review(row), 409);
      const latest = await sim.prisma.memberExperience.findUnique({ where: { id: row.id } });
      check(await review(latest, { action: "reject", reviewReason: "請補佐證" }), 200);
      assert.equal((await sim.prisma.memberExperience.findUnique({ where: { id: row.id } })).rejectedReason, "請補佐證");
    });
    await t.test("audit failure rolls back approval; serialization conflict returns 409 without writes", async () => {
      await grant("CLUB_PRESIDENT", s.ai);
      const row = await experience("club_secretary");
      const transaction = sim.prisma.$transaction.bind(sim.prisma);
      sim.prisma.$transaction = (work, options) => transaction(tx => work(new Proxy(tx, { get(target, key) {
        if (key === "experienceReviewAudit") return { create: async () => { throw Error("SIMULATED_AUDIT_FAILURE"); } };
        return typeof target[key] === "function" ? target[key].bind(target) : target[key];
      } })), options);
      try { await assert.rejects(review(row), /SIMULATED_AUDIT_FAILURE/); }
      finally { sim.prisma.$transaction = transaction; }
      assert.equal((await sim.prisma.memberExperience.findUnique({ where: { id: row.id } })).verificationStatus, "under_review");
      assert.equal(await sim.prisma.experienceReviewAudit.count({ where: { experienceId: row.id } }), 0);
      sim.prisma.$transaction = async () => { throw Object.assign(Error("simulated serialization"), { code: "P2034" }); };
      try { check(await review(row), 409); }
      finally { sim.prisma.$transaction = transaction; }
      assert.equal((await sim.prisma.memberExperience.findUnique({ where: { id: row.id } })).verificationStatus, "under_review");
    });
  } finally { await sim.close(); }
});
