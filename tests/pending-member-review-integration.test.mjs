import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";
const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const expect = (result, status) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };

// Disposable SQL, real route code and synthetic cookies/bearer credentials only.
// No production DB, external email, cloud resources or real applicants.
test("both pending-member APIs preserve historical dates, require confirmed snapshots and protect history", { timeout: 120000 }, async t => {
  const sim = await createSimulation();
  try {
    const s = await seedScenario(sim, "join-review"), jars = new Map();
    for (const actor of [s.chair, s.member]) {
      const jar = sim.jar(); expect(await sim.call("/api/auth/login", "POST", { email: actor.email, password: s.password }, jar), 200); jars.set(actor.id, jar);
    }
    const outside = await sim.prisma.organization.create({ data: { level: "club", name: "合成無權分會" } });
    async function call(platform, method, memberId, body, actor = s.chair) {
      const path = `admin/pending-members${memberId ? `/${memberId}` : ""}`;
      if (platform === "web") return sim.call(`/api/${path}`, method, body, jars.get(actor.id));
      const token = await sim.load("src/lib/mobile-auth.ts").signMobileAccessToken({ userId: actor.user.id, memberId: actor.id, email: actor.email, sessionVersion: actor.user.sessionVersion }, new TextEncoder().encode(sim.env.AUTH_SECRET));
      const handler = sim.load(`src/app/api/mobile/admin/pending-members${memberId ? "/[memberId]" : ""}/route.ts`)[method];
      const response = await handler(new NextRequest(`${sim.origin}/api/mobile/${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), { params: Promise.resolve({ memberId }) });
      return { status: response.status, data: await response.json() };
    }
    let serial = 0;
    async function pending(extra = {}) {
      const email = `join-applicant-${++serial}@example.test`;
      return sim.prisma.member.create({ data: { name: "合成歷史待審會員", email, organizationId: s.ai.id, organizationAssignmentStatus: "NEEDS_ASSIGNMENT", status: "PENDING", joinYear: 2003, joinMonth: 8,
        user: { create: { email, passwordHash: s.member.user.passwordHash } }, ...extra }, include: { user: true } });
    }
    const snapshot = row => ({ expectedUpdatedAt: row.updatedAt.toISOString(), expectedOrganizationId: row.organizationId });
    for (const platform of ["web", "mobile"]) {
      await t.test(`${platform}: GET exposes real dates/version; legacy action-only approval preserves history and unknowns`, async () => {
        for (const dates of [{ joinYear: 2003, joinMonth: 8 }, { joinYear: 2003, joinMonth: null }, { joinYear: null, joinMonth: null }]) {
          const row = await pending(dates), list = expect(await call(platform, "GET"), 200).members.find(item => item.id === row.id);
          assert.equal(list.joinYear, dates.joinYear); assert.equal(list.joinMonth, dates.joinMonth); assert.equal(list.updatedAt, row.updatedAt.toISOString());
          const result = expect(await call(platform, "POST", row.id, { action: "approve" }), 200);
          assert.equal(result.joinYear, dates.joinYear); assert.equal(result.joinMonth, dates.joinMonth);
          const approved = await sim.prisma.member.findUniqueOrThrow({ where: { id: row.id } });
          assert.equal(approved.joinYear, dates.joinYear); assert.equal(approved.joinMonth, dates.joinMonth); assert.equal(approved.status, "ACTIVE");
          assert.equal(approved.organizationAssignmentStatus, "NEEDS_ASSIGNMENT");
          assert.equal(await sim.prisma.adminRole.count({ where: { memberId: row.id } }), 0);
        }
      });
      await t.test(`${platform}: explicit unknowns clear dates, omitted month preserves history, and month requires a known year`, async () => {
        const cleared = await pending(); expect(await call(platform, "POST", cleared.id, { action: "approve", ...snapshot(cleared), joinYear: null, joinMonth: null }), 200);
        const stored = await sim.prisma.member.findUniqueOrThrow({ where: { id: cleared.id } }); assert.equal(stored.joinYear, null); assert.equal(stored.joinMonth, null);
        const yearOnly = await pending(); expect(await call(platform, "POST", yearOnly.id, { action: "approve", ...snapshot(yearOnly), joinYear: 1999 }), 200);
        const yearStored = await sim.prisma.member.findUniqueOrThrow({ where: { id: yearOnly.id } }); assert.equal(yearStored.joinYear, 1999); assert.equal(yearStored.joinMonth, 8);
        for (const change of [{ joinYear: null }, { joinMonth: 13 }, { joinYear: 1899 }, { joinYear: "2003" }, { expectedUpdatedAt: "invalid" }]) {
          const row = await pending(), before = sim.inbox.length;
          expect(await call(platform, "POST", row.id, { action: "approve", ...snapshot(row), ...change }), 400);
          assert.equal((await sim.prisma.member.findUniqueOrThrow({ where: { id: row.id } })).status, "PENDING"); assert.equal(sim.inbox.length, before);
        }
      });
      await t.test(`${platform}: stale versions, changed or unowned organizations and unprivileged actors cannot approve or reject`, async () => {
        const stale = await pending(), old = snapshot(stale);
        await sim.prisma.member.update({ where: { id: stale.id }, data: { name: "合成已更新申請", updatedAt: new Date(+stale.updatedAt + 1000) } });
        for (const action of ["approve", "reject"]) expect(await call(platform, "POST", stale.id, { action, ...old, joinYear: 2003, joinMonth: 8 }), 409);
        const moved = await pending(), previous = snapshot(moved);
        await sim.prisma.member.update({ where: { id: moved.id }, data: { organizationId: s.other.id } });
        expect(await call(platform, "POST", moved.id, { action: "approve", ...previous }), 409);
        const out = await pending({ organizationId: outside.id }); expect(await call(platform, "POST", out.id, { action: "approve", ...snapshot(out) }), 409);
        const ordinary = await pending(); expect(await call(platform, "POST", ordinary.id, { action: "approve", ...snapshot(ordinary) }, s.member), 403);
        for (const row of [stale, moved, out, ordinary]) { assert.equal((await sim.prisma.member.findUniqueOrThrow({ where: { id: row.id } })).status, "PENDING"); assert.ok(await sim.prisma.user.findUnique({ where: { memberId: row.id } })); }
      });
      await t.test(`${platform}: shared activity history blocks rejection while a history-free rejection is acknowledged only after deletion`, async () => {
        const historical = await pending();
        await sim.prisma.event.create({ data: { title: "合成歷史活動", startAt: new Date("2003-08-01"), hostOrganizationId: s.ai.id, createdById: historical.id } });
        const before = sim.inbox.length; expect(await call(platform, "POST", historical.id, { action: "reject", ...snapshot(historical) }), 409);
        assert.ok(await sim.prisma.member.findUnique({ where: { id: historical.id } })); assert.ok(await sim.prisma.user.findUnique({ where: { memberId: historical.id } })); assert.equal(sim.inbox.length, before);
        const assigned = await pending();
        const assignment = await sim.prisma.memberOrganizationAssignment.create({ data: { memberId: assigned.id, toOrganizationId: s.ai.id, toOrganizationName: s.ai.name,
          previousAssignmentStatus: "NEEDS_ASSIGNMENT", assignmentStatus: "ASSIGNED", assignedById: s.chair.id, reason: "合成既有分會指派紀錄" } });
        expect(await call(platform, "POST", assigned.id, { action: "reject", ...snapshot(assigned) }), 409);
        assert.ok(await sim.prisma.member.findUnique({ where: { id: assigned.id } })); assert.ok(await sim.prisma.user.findUnique({ where: { memberId: assigned.id } }));
        assert.deepEqual(await sim.prisma.memberOrganizationAssignment.findUnique({ where: { id: assignment.id } }), assignment);
        const empty = await pending(); expect(await call(platform, "POST", empty.id, { action: "reject", ...snapshot(empty) }), 200);
        assert.equal(await sim.prisma.member.findUnique({ where: { id: empty.id } }), null); assert.equal(await sim.prisma.user.findUnique({ where: { memberId: empty.id } }), null);
        expect(await call(platform, "POST", empty.id, { action: "reject", ...snapshot(empty) }), 409);
      });
    }
  } finally { await sim.close(); }
});
