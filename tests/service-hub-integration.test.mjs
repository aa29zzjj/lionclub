import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";
const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const expect = (r, status) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };

test("production service routes use real SQL, scoped review, CAS and both authentication transports", { timeout: 120000 }, async t => {
  const sim = await createSimulation();
  try {
    const s = await seedScenario(sim, "service-hub"), jars = new Map();
    const termsVersion = sim.load("src/lib/terms.ts").TERMS_VERSION;
    for (const actor of [s.chair, s.member, s.friend]) {
      await sim.prisma.member.update({ where: { id: actor.id }, data: { termsVersion, termsAcceptedAt: new Date() } });
      const jar = sim.jar(); expect(await sim.call("/api/auth/login", "POST", { email: actor.email, password: s.password }, jar), 200); jars.set(actor.id, jar);
    }
    let platform = "web";
    async function call(actor, method = "GET", body, query = "year=2026", options = {}) {
      const expected = options.expected ?? actor.id;
      if (platform === "web") return sim.call(`/api/services?${query}`, method, body, jars.get(actor.id), { headers: { "x-lionclubs-member": expected }, ...options });
      const token = await sim.load("src/lib/mobile-auth.ts").signMobileAccessToken({ userId: actor.user.id, memberId: actor.id, email: actor.email, sessionVersion: actor.user.sessionVersion }, new TextEncoder().encode(sim.env.AUTH_SECRET));
      const request = new NextRequest(`${sim.origin}/api/mobile/services?${query}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-lionclubs-member": expected }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const response = await sim.load("src/app/api/mobile/services/route.ts")[method](request);
      return { status: response.status, data: await response.json() };
    }
    const createNeed = (suffix = "") => ({ action: "need.create", requestId: randomUUID(), kind: "NEED", title: `合成場地需求${suffix}`, category: "場地", description: "合成測試，提供活動空間", targetDate: "2026-12-10", quantity: 1, quantityUnit: "處" });
    const createEntry = (suffix = "") => ({ action: "entry.create", requestId: randomUUID(), title: `合成服務${suffix}`, category: "環境服務", date: "2026-10-18", minutes: 120, note: "合成測試備註" });
    await t.test("unauthenticated web/mobile, foreign Origin and stale account cannot mutate", async () => {
      expect(await sim.call("/api/services"), 401);
      const r = await sim.load("src/app/api/mobile/services/route.ts").GET(new NextRequest(`${sim.origin}/api/mobile/services`)); assert.equal(r.status, 401);
      expect(await call(s.member, "POST", createNeed(), "", { origin: "https://foreign.example.test" }), 403);
      expect(await call(s.member, "POST", createNeed(), "", { expected: s.friend.id }), 409);
      assert.equal(await sim.prisma.resourceNeed.count(), 0);
    });
    for (const side of ["web", "mobile"]) {
      platform = side;
      await t.test(`${side}: resource requests are idempotent, private replies stay private, and only owner/scope manages`, async () => {
        const body = createNeed(side), need = expect(await call(s.member, "POST", body), 200);
        assert.equal(expect(await call(s.member, "POST", body), 200).duplicate, true);
        expect(await call(s.member, "POST", { action: "need.respond", id: need.id, message: "自己回應自己" }), 400);
        expect(await call(s.friend, "POST", { action: "need.respond", id: need.id, message: "合成獅友願意支援" }), 200);
        const ownerView = expect(await call(s.member), 200).needs.find(n => n.id === need.id);
        assert.equal(ownerView.responses.length, 1);
        assert.equal(expect(await call(s.friend), 200).needs.find(n => n.id === need.id).responses.length, 0);
        expect(await call(s.friend, "POST", { action: "need.accept", id: need.id, responseId: ownerView.responses[0].id, version: ownerView.version }), 403);
        expect(await call(s.member, "POST", { action: "need.complete", id: need.id, version: ownerView.version, note: "尚未接受" }), 409);
        expect(await call(s.member, "POST", { action: "need.accept", id: need.id, responseId: ownerView.responses[0].id, version: ownerView.version }), 200);
        expect(await call(s.member, "POST", { action: "need.accept", id: need.id, responseId: ownerView.responses[0].id, version: ownerView.version }), 409);
        const matched = await sim.prisma.resourceNeed.findUniqueOrThrow({ where: { id: need.id } });
        expect(await call(s.member, "POST", { action: "need.complete", id: need.id, version: matched.version, note: "合成合作完成" }), 200);
        assert.equal((await sim.prisma.resourceNeed.findUniqueOrThrow({ where: { id: need.id } })).status, "COMPLETED");
        assert.equal(await sim.prisma.serviceAudit.count({ where: { entityId: need.id } }), 4);
      });
      await t.test(`${side}: passport self-declarations do not inflate confirmed hours; self review and scope spoof fail`, async () => {
        const body = createEntry(side), entry = expect(await call(s.member, "POST", body), 200);
        expect(await call(s.member, "POST", { ...body, requestId: randomUUID() }), 409);
        const own = expect(await call(s.member), 200);
        const row = own.entries.find(e => e.id === entry.id); assert.equal(row.status, "PENDING");
        expect(await call(s.member, "POST", { action: "entry.review", id: entry.id, version: row.version, decision: "CONFIRMED", reason: "" }), 403);
        await sim.prisma.member.update({ where: { id: s.friend.id }, data: { role: "CLUB_PRESIDENT" } });
        expect(await call(s.friend, "POST", { action: "entry.review", id: entry.id, version: row.version, decision: "CONFIRMED", reason: "" }), 403);
        assert.ok(expect(await call(s.chair), 200).reviewEntries.some(e => e.id === entry.id));
        expect(await call(s.chair, "POST", { action: "entry.review", id: entry.id, version: row.version, decision: "CONFIRMED", reason: "已核對合成紀錄" }), 200);
        expect(await call(s.chair, "POST", { action: "entry.review", id: entry.id, version: row.version, decision: "CONFIRMED", reason: "" }), 409);
        const updated = expect(await call(s.member), 200); assert.ok(updated.totals.confirmedMinutes >= 120);
        expect(await call(s.member, "POST", { action: "entry.update", id: entry.id, version: 2, title: "改寫已核實", date: "2026-10-18", category: "環境", minutes: 900, note: "" }), 403);
        const exported = expect(await call(s.member, "GET", undefined, "year=2026&view=passport-export"), 200);
        assert.ok(exported.content.includes("不是官方核定服務證明")); assert.ok(exported.content.includes(body.title)); assert.ok(!exported.content.includes(s.friend.email));
      });
    }
    platform = "web";
    await t.test("blocking hides needs and forbids responses; wrong-need response IDs cannot be accepted", async () => {
      const n1 = expect(await call(s.member, "POST", createNeed("block-a")), 200), n2 = expect(await call(s.member, "POST", createNeed("block-b")), 200);
      expect(await call(s.friend, "POST", { action: "need.respond", id: n1.id, message: "合成回應一" }), 200);
      expect(await call(s.friend, "POST", { action: "need.respond", id: n2.id, message: "合成回應二" }), 200);
      const rows = expect(await call(s.member), 200).needs, a = rows.find(n => n.id === n1.id), b = rows.find(n => n.id === n2.id);
      expect(await call(s.member, "POST", { action: "need.accept", id: n1.id, responseId: b.responses[0].id, version: a.version }), 409);
      await sim.prisma.memberBlock.create({ data: { blockerId: s.friend.id, blockedId: s.member.id } });
      assert.ok(!expect(await call(s.friend), 200).needs.some(n => n.id === n1.id));
      expect(await call(s.friend, "POST", { action: "need.respond", id: n1.id, message: "封鎖後的回應" }), 404);
    });
    await t.test("group outcome uses real attendance, rejects overstatement, and never creates personal hours", async () => {
      await sim.prisma.event.update({ where: { id: s.event.id }, data: { startAt: new Date("2026-10-18T00:00:00Z") } });
      await sim.prisma.eventRegistration.create({ data: { eventId: s.event.id, memberId: s.member.id, checkedInAt: new Date("2026-10-18T00:10:00Z"), checkedInById: s.chair.id } });
      const body = { action: "outcome.save", eventId: s.event.id, version: 0, endAt: "2026-10-18T04:00:00Z", beneficiaryCount: null, quantity: 20, quantityUnit: "袋", totalServiceMinutes: 240, summary: "合成活動成果" };
      expect(await call(s.member, "POST", body), 403);
      expect(await call(s.chair, "POST", { ...body, totalServiceMinutes: 241 }), 400);
      const before = await sim.prisma.serviceEntry.count(); expect(await call(s.chair, "POST", body), 200);
      assert.equal(await sim.prisma.serviceEntry.count(), before);
      const exported = expect(await call(s.chair, "GET", undefined, `year=2026&view=outcome-export&id=${s.event.id}`), 200);
      assert.ok(exported.content.includes("實際報到：1 人")); assert.ok(exported.content.includes("未向國際獅子會官方通報"));
      expect(await call(s.member, "POST", { ...createEntry("linked"), eventId: s.event.id, minutes: 241 }), 400);
    });
    await t.test("review revocation, resubmission and expired authority preserve truthful totals", async () => {
      const entry = await sim.prisma.serviceEntry.findFirstOrThrow({ where: { memberId: s.member.id, status: "CONFIRMED" } });
      expect(await call(s.chair, "POST", { action: "entry.revoke", id: entry.id, version: entry.version, reason: "合成核對發現需補充" }), 200);
      assert.equal((await sim.prisma.serviceEntry.findUniqueOrThrow({ where: { id: entry.id } })).status, "REVOKED");
      expect(await call(s.member, "POST", { action: "entry.update", id: entry.id, version: entry.version + 1, title: entry.title, category: entry.category, date: "2026-10-18", minutes: 90, note: "合成修正後重新提交" }), 200);
      const resubmitted = await sim.prisma.serviceEntry.findUniqueOrThrow({ where: { id: entry.id } });
      assert.equal(resubmitted.status, "PENDING"); assert.equal(resubmitted.reviewedById, null);
      await sim.prisma.adminRole.updateMany({ where: { memberId: s.chair.id }, data: { validUntil: new Date("2026-01-01") } });
      expect(await call(s.chair, "POST", { action: "entry.review", id: entry.id, version: resubmitted.version, decision: "CONFIRMED", reason: "" }), 403);
      assert.equal(expect(await call(s.chair), 200).canReview, false);
      await sim.prisma.adminRole.updateMany({ where: { memberId: s.chair.id }, data: { validUntil: null } });
    });
    await t.test("pagination is complete without duplicate needs and yearly totals include off-page entries", async () => {
      await sim.prisma.resourceNeed.createMany({ data: Array.from({ length: 55 }, (_, i) => ({ ownerId: s.chair.id, organizationId: s.ai.id, requestId: randomUUID(), kind: "OFFER", title: `合成頁次 ${i}`, category: "頁次測試", description: "合成分頁資料", targetDate: new Date("2026-12-10"), quantity: 1, quantityUnit: "份" })) });
      const first = expect(await call(s.member, "GET", undefined, "year=2026&category=頁次測試"), 200);
      assert.equal(first.needs.length, 50); assert.ok(first.nextCursors.needs);
      const second = expect(await call(s.member, "GET", undefined, `year=2026&category=頁次測試&needsCursor=${first.nextCursors.needs}`), 200);
      assert.equal(second.needs.length, 5); assert.equal(new Set([...first.needs, ...second.needs].map(n => n.id)).size, 55);
      await sim.prisma.serviceEntry.createMany({ data: Array.from({ length: 105 }, (_, i) => ({ memberId: s.member.id, organizationId: s.ai.id, requestId: randomUUID(), dedupKey: `synthetic-page-${i}`, title: `合成補登 ${i}`, category: "分頁", date: new Date("2026-10-19"), minutes: 15 })) });
      const hub = expect(await call(s.member), 200); assert.equal(hub.entries.length, 100); assert.ok(hub.totals.pendingMinutes >= 1575);
      const exported = expect(await call(s.member, "GET", undefined, "year=2026&view=passport-export"), 200);
      assert.ok(exported.content.includes("合成補登 104"));
    });
    await t.test("a failed audit rolls the entire review back", async () => {
      const created = expect(await call(s.member, "POST", createEntry("rollback")), 200);
      await sim.database.exec(`CREATE FUNCTION fail_service_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$; CREATE TRIGGER service_audit_failure BEFORE INSERT ON "ServiceAudit" FOR EACH ROW EXECUTE FUNCTION fail_service_audit();`);
      expect(await call(s.chair, "POST", { action: "entry.review", id: created.id, version: 1, decision: "CONFIRMED", reason: "" }), 503);
      assert.equal((await sim.prisma.serviceEntry.findUniqueOrThrow({ where: { id: created.id } })).status, "PENDING");
      await sim.database.exec('DROP TRIGGER service_audit_failure ON "ServiceAudit"; DROP FUNCTION fail_service_audit();');
    });
    await t.test("account deletion removes private passport data and redacts authored resource content", async () => {
      const { anonymizeAccount } = sim.load("src/lib/account-deletion.ts");
      const user = await sim.prisma.user.findUniqueOrThrow({ where: { id: s.member.user.id } });
      const result = await anonymizeAccount(sim.prisma, { memberId: s.member.id, userId: user.id, expectedPasswordHash: user.passwordHash });
      assert.equal(result.accountDeleted, true);
      assert.equal(await sim.prisma.serviceEntry.count({ where: { memberId: s.member.id } }), 0);
      assert.equal(await sim.prisma.resourceNeed.count({ where: { ownerId: s.member.id, status: { not: "CLOSED" } } }), 0);
      assert.equal(await sim.prisma.resourceNeed.count({ where: { ownerId: s.member.id, description: { not: "原發布內容已移除" } } }), 0);
      assert.ok(await sim.prisma.serviceAudit.count({ where: { actorId: s.member.id } }) > 0);
    });
  } finally { await sim.close(); }
});
