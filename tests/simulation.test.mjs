import assert from "node:assert/strict";
import { test } from "node:test";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

const tokenIn = mail => new URL(mail.text.match(/https:\/\/simulation\.example\.test\/\S+/)[0]).searchParams.get("token");
const status = (result, expected) => { assert.equal(result.status, expected, JSON.stringify(result.data)); return result.data; };
async function login(sim, person, password = "SimulationPass42!") { const jar = sim.jar(); status(await sim.call("/api/auth/login", "POST", { email: person.email, password }, jar), 200); return jar; }

test("isolated real-route / real-SQL acceptance", { timeout: 180000 }, async t => {
  const sim = await createSimulation();
  try {
    const s = await seedScenario(sim);
    const chair = await login(sim, s.chair), member = await login(sim, s.member), friend = await login(sim, s.friend);
    await t.test("QR required, immediate intake registration, captured mail and one-use verification", async () => {
      const jar = sim.jar();
      const body = { name: "模擬來賓", email: "new@example.test", password: s.password, organizationId: s.ai.id, privacyConsent: true, termsConsent: true };
      status(await sim.call("/api/auth/register", "POST", { ...body, token: s.invite.token, privacyConsent: false }, jar), 400);
      status(await sim.call("/api/auth/register", "POST", { ...body, token: s.invite.token, termsConsent: false }, jar), 400);
      status(await sim.call("/api/auth/register", "POST", body, jar), 400);
      const registered = status(await sim.call("/api/auth/register", "POST", { ...body, token: s.invite.token }, jar), 200);
      assert.equal(registered.organizationAssignmentStatus, "NEEDS_ASSIGNMENT"); assert.equal(registered.canLogin, true);
      assert.equal(status(await sim.call("/api/me", "GET", undefined, jar), 200).organization.id, s.ai.id);
      const mail = sim.inbox.find(mail => mail.to === body.email && mail.subject.includes("驗證")); assert.ok(mail);
      const token = tokenIn(mail);
      status(await sim.call("/api/auth/verify-email", "POST", { token }, jar), 200);
      status(await sim.call("/api/auth/verify-email", "POST", { token }, jar), 400);
      const before = status(await sim.call("/api/me", "GET", undefined, jar), 200).emailVerifiedAt;
      assert.ok(before);
      const unchanged = status(await sim.call("/api/me", "PATCH", { email: body.email.toUpperCase(), nickname: "好獅友" }, jar), 200);
      assert.equal(unchanged.emailVerifiedAt, before);
      status(await sim.call("/api/auth/forgot-password", "POST", { email: body.email }), 200);
      const oldReset = tokenIn(sim.inbox.at(-1));
      status(await sim.call("/api/me", "PATCH", { email: "new-current@example.test" }, jar), 200);
      status(await sim.call("/api/auth/reset-password", "POST", { token: oldReset, password: "ResetPassword42!" }), 400);
      status(await sim.call("/api/me/resend-verification", "POST", {}, jar), 200);
      assert.equal(sim.inbox.at(-1).to, "new-current@example.test");
      status(await sim.call("/api/auth/verify-email", "POST", { token: tokenIn(sim.inbox.at(-1)) }), 200);
    });
    await t.test("same banquet IP supports twelve distinct registrations, retains rate protection", async () => {
      for (let i = 0; i < 12; i++) status(await sim.call("/api/auth/register", "POST", { name: `來賓${i}`, email: `banquet-${i}@example.test`, password: s.password, token: s.invite.token, privacyConsent: true, termsConsent: true }, sim.jar(), { ip: "192.0.2.33" }), 200);
      const { consumeRateLimit } = sim.load("src/lib/rate-limit.ts");
      assert.equal(typeof consumeRateLimit, "function");
      const now = new Date();
      const results = await Promise.all(Array.from({ length: 12 }, () => consumeRateLimit(sim.prisma, "simulation-counter", 5, 60000, now)));
      assert.equal(results.filter(r => !r.limited).length, 5); assert.equal(Math.max(...results.map(r => r.count)), 12);
      const limited = sim.load("src/lib/rate-limit.ts").rateLimitResponse(results.find(r => r.limited));
      assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get("Retry-After")) > 0);
    });
    await t.test("other-device logout retains only current device, then reset invalidates every device", async () => {
      const a = await login(sim, s.friend), b = await login(sim, s.friend);
      status(await sim.call("/api/me/sessions/revoke", "POST", { password: "wrong" }, a), 401);
      status(await sim.call("/api/me/sessions/revoke", "POST", { password: s.password }, a, { origin: null }), 403);
      assert.equal(status(await sim.call("/api/me/sessions/revoke", "POST", { password: s.password }, a), 200).currentSessionRetained, true);
      status(await sim.call("/api/me", "GET", undefined, b), 401); status(await sim.call("/api/me", "GET", undefined, a), 200);
      status(await sim.call("/api/auth/forgot-password", "POST", { email: s.friend.email }), 200);
      const token = tokenIn(sim.inbox.at(-1));
      status(await sim.call("/api/auth/reset-password", "POST", { token, password: "ResetPassword42!" }), 200);
      status(await sim.call("/api/me", "GET", undefined, a), 401);
      status(await sim.call("/api/auth/reset-password", "POST", { token, password: "ResetPassword42!" }), 400);
      const replacement = await login(sim, s.friend, "ResetPassword42!"); friend.clear(); for (const entry of replacement) friend.set(...entry);
    });
    await t.test("production refuses weak-password and demo-number accounts without changing their passwords", async () => {
      await sim.prisma.member.update({ where: { id: s.member.id }, data: { memberNo: "DEMO-0001" } });
      status(await sim.call("/api/auth/login", "POST", { email: s.member.email, password: s.password }), 401);
      await sim.prisma.member.update({ where: { id: s.member.id }, data: { memberNo: null } });
      status(await sim.call("/api/auth/login", "POST", { email: s.member.email, password: "0204" }), 403);
    });
    await t.test("future / expired SUPER and null-scope roles never confer global permissions", async () => {
      status(await sim.call("/api/admin/reports", "GET", undefined, member), 403);
      const role = await sim.prisma.adminRole.create({ data: { memberId: s.member.id, role: "SUPER_ADMIN", scopeType: "global", validFrom: new Date("2100-01-01") } });
      status(await sim.call("/api/admin/reports", "GET", undefined, member), 403);
      await sim.prisma.adminRole.update({ where: { id: role.id }, data: { validFrom: new Date("2020-01-01"), validUntil: new Date("2021-01-01") } });
      status(await sim.call("/api/admin/reports", "GET", undefined, member), 403);
      await sim.prisma.adminRole.update({ where: { id: role.id }, data: { role: "DISTRICT_ADMIN", validUntil: null } });
      status(await sim.call("/api/admin/pending-members", "GET", undefined, member), 403);
      await sim.prisma.adminRole.update({ where: { id: role.id }, data: { role: "SUPER_ADMIN" } });
      status(await sim.call("/api/admin/reports", "GET", undefined, member), 200);
      await sim.prisma.adminRole.delete({ where: { id: role.id } });
      await sim.prisma.organization.update({ where: { id: s.ai.id }, data: { parentId: s.other.id } });
      await sim.prisma.organization.update({ where: { id: s.other.id }, data: { parentId: s.ai.id } });
      status(await sim.call("/api/admin/pending-members", "GET", undefined, chair), 200);
      await sim.prisma.organization.updateMany({ where: { id: { in: [s.ai.id, s.other.id] } }, data: { parentId: null } });
    });
    await t.test("notification inbox/read ownership, club target and mutual block privacy", async () => {
      const sent = status(await sim.call("/api/notifications", "POST", { eventId: s.event.id, memberIds: [s.friend.id], message: "模擬通知" }, member), 200);
      const inbox = status(await sim.call("/api/notifications", "GET", undefined, friend), 200);
      assert.ok(inbox.inbox.some(n => n.notificationId === sent.notificationId));
      assert.equal(status(await sim.call("/api/notifications", "PATCH", { ids: [sent.notificationId] }, chair), 200).updatedCount, 0);
      assert.equal(status(await sim.call("/api/notifications", "PATCH", { ids: [sent.notificationId] }, friend), 200).updatedCount, 1);
      const otherEvent = await sim.prisma.event.create({ data: { title: "別會活動", startAt: new Date(), hostOrganizationId: s.other.id, createdById: s.chair.id } });
      await sim.prisma.member.update({ where: { id: s.friend.id }, data: { organizationId: s.other.id } });
      const orgNotice = status(await sim.call("/api/notifications", "POST", { eventId: otherEvent.id, recipientType: "organization" }, chair), 200);
      const recipients = await sim.prisma.eventNotificationRecipient.findMany({ where: { notificationId: orgNotice.notificationId } });
      assert.deepEqual(recipients.map(r => r.recipientId), [s.friend.id]);
      status(await sim.call(`/api/members/${s.friend.id}/block`, "POST", {}, member), 200);
      assert.equal(status(await sim.call("/api/me/blocks", "GET", undefined, member), 200).blocks[0].member.id, s.friend.id);
      status(await sim.call(`/api/members/${s.friend.id}`, "GET", undefined, member), 404);
      const friends = status(await sim.call("/api/friends", "GET", undefined, member), 200); assert.equal(friends.friends.length, 0);
      assert.equal(status(await sim.call("/api/notifications", "GET", undefined, friend), 200).inbox.some(n => n.notificationId === sent.notificationId), false);
      status(await sim.call(`/api/members/${s.friend.id}/block`, "DELETE", {}, member), 200);
      assert.equal(status(await sim.call("/api/me/blocks", "GET", undefined, member), 200).blocks.length, 0);
      assert.equal(await sim.prisma.friendship.count(), 0);
    });
    await t.test("cancelled registrations free capacity; manual / QR check-in and history cannot be erased", async () => {
      const path = `/api/events/${s.event.id}`;
      await sim.prisma.event.update({ where: { id: s.event.id }, data: { capacity: 1 } });
      status(await sim.call(`${path}/register`, "POST", {}, member), 200);
      const registration = await sim.prisma.eventRegistration.findFirst({ where: { memberId: s.member.id, eventId: s.event.id } });
      status(await sim.call(`${path}/register`, "POST", {}, member), 200);
      assert.equal(status(await sim.call(path, "GET", undefined, member), 200).event.registeredCount, 0);
      status(await sim.call(`${path}/register`, "POST", {}, friend), 200);
      status(await sim.call(`${path}/register`, "POST", {}, member), 409);
      status(await sim.call(`${path}/check-in`, "POST", { memberId: s.friend.id, method: "manual", reason: " " }, chair), 400);
      const first = status(await sim.call(`${path}/check-in`, "POST", { memberId: s.friend.id, method: "manual", reason: "名冊人工核對" }, chair), 200);
      assert.equal(first.checkedInCount, 1);
      const second = status(await sim.call(`${path}/check-in`, "POST", { qrValue: `lionclub:member:${s.friend.id}` }, chair), 200);
      assert.equal(second.alreadyCheckedIn, true); assert.equal(second.checkedInAt, first.checkedInAt);
      status(await sim.call(`${path}/register`, "POST", {}, friend), 409);
      assert.equal(status(await sim.call(path, "GET", undefined, friend), 200).event.isCheckedIn, true);
      status(await sim.call(path, "DELETE", {}, chair), 409);
      assert.equal(await sim.prisma.eventCheckInAudit.count(), 1); assert.ok(await sim.prisma.eventRegistration.findUnique({ where: { id: registration.id } }));
    });
    await t.test("event delete uses a serializable guard/mutation transaction; conflict fails closed", async () => {
      const saved = sim.prisma.$transaction.bind(sim.prisma); let sawGuard = false, sawDelete = false;
      const event = await sim.prisma.event.create({ data: { title: "可刪除模擬活動", startAt: new Date(), hostOrganizationId: s.ai.id, createdById: s.chair.id } });
      sim.prisma.$transaction = async (callback, options) => {
        assert.equal(options.isolationLevel, "Serializable");
        return saved(async tx => callback(new Proxy(tx, { get(target, key) {
          if (key === "eventRegistration") return new Proxy(target.eventRegistration, { get(model, method) { if (method === "count") return async args => { sawGuard = true; return model.count(args); }; return model[method]; } });
          if (key === "event") return new Proxy(target.event, { get(model, method) { if (method === "delete") return async args => { assert.equal(sawGuard, true); sawDelete = true; return model.delete(args); }; return model[method]; } });
          return target[key];
        } })), options);
      };
      try { status(await sim.call(`/api/events/${event.id}`, "DELETE", {}, chair), 200); assert.equal(sawDelete, true);
        sim.prisma.$transaction = async () => { throw Object.assign(new Error("controlled serialization conflict"), { code: "P2034" }); };
        status(await sim.call(`/api/events/${s.event.id}`, "DELETE", {}, chair), 409);
      } finally { sim.prisma.$transaction = saved; }
    });
    await t.test("bulk uses exact legacy email, rejects ambiguous / self / duplicate, commits mixed CAS results", async () => {
      const upper = await sim.prisma.member.create({ data: { name: "Upper", email: "Case@example.test", organizationId: s.ai.id, status: "ACTIVE" } });
      const lower = await sim.prisma.member.create({ data: { name: "Lower", email: "case@example.test", organizationId: s.ai.id, status: "ACTIVE" } });
      const preview = status(await sim.call("/api/admin/member-assignments/bulk/preview", "POST", { rows: [{ email: "Case@example.test", organizationId: s.other.id }, { email: "CASE@EXAMPLE.TEST", organizationId: s.other.id }] }, chair), 200);
      assert.equal(preview.rows[0].memberId, upper.id); assert.match(preview.rows[1].error, /多|重複|相同|不唯一/);
      const results = status(await sim.call("/api/admin/member-assignments/bulk/commit", "POST", { rows: [upper, lower].map((person, i) => ({ memberId: person.id, organizationId: s.other.id, expectedOrganizationId: s.ai.id, expectedAssignmentVersion: i ? 99 : 0, reason: "模擬名單核對" })) }, chair), 200).results;
      assert.equal(results[0].status, 200); assert.equal(results[1].status, 409);
      assert.equal(await sim.prisma.memberOrganizationAssignment.count({ where: { memberId: upper.id } }), 1);
    });
    await t.test("pending review preserves legacy shared history, repeated approval conflicts and emails follow commit", async () => {
      const pending = await sim.prisma.member.create({ data: { name: "待審", email: "pending@example.test", status: "PENDING", organizationId: s.ai.id } });
      await sim.prisma.eventNotification.create({ data: { eventId: s.event.id, senderId: pending.id, message: "legacy" } });
      const before = sim.inbox.length;
      status(await sim.call(`/api/admin/pending-members/${pending.id}`, "POST", { action: "reject" }, chair), 409);
      assert.equal(sim.inbox.length, before);
      status(await sim.call(`/api/admin/pending-members/${pending.id}`, "POST", { action: "approve" }, chair), 200);
      status(await sim.call(`/api/admin/pending-members/${pending.id}`, "POST", { action: "reject" }, chair), 409);
      assert.equal((await sim.prisma.member.findUnique({ where: { id: pending.id } })).status, "ACTIVE");
    });
    await t.test("delete anonymizes self, preserves other attendees, revokes devices and delays avatar sweep", async () => {
      const data = await seedScenario(sim, "deletion"); const a = await login(sim, data.member), b = await login(sim, data.member);
      const past = await sim.prisma.event.create({ data: { title: "共享歷史", startAt: new Date("2020-01-01"), createdById: data.member.id, hostOrganizationId: data.ai.id } });
      await sim.prisma.eventRegistration.create({ data: { eventId: past.id, memberId: data.friend.id, checkedInAt: new Date() } });
      const result = status(await sim.call("/api/me/account-deletion", "POST", { password: data.password }, a), 200);
      assert.equal(result.cleanupPending, true); status(await sim.call("/api/me", "GET", undefined, b), 401);
      const tombstone = await sim.prisma.member.findUnique({ where: { id: data.member.id } }); assert.equal(tombstone.name, "已刪除會員"); assert.equal(tombstone.email, null); assert.ok(tombstone.deletedAt);
      assert.ok(await sim.prisma.event.findUnique({ where: { id: past.id } })); assert.equal(await sim.prisma.eventRegistration.count({ where: { eventId: past.id } }), 1);
      const { processAccountDeletionCleanup } = sim.load("src/lib/account-deletion.ts"); let keys = [`avatars/${data.member.id}/old.png`]; let fail = true;
      const storage = { async listKeys() { if (fail) throw Error("simulated S3 failure"); return [...keys]; }, async deleteKeys(input) { assert.ok(input.keys.every(k => k.startsWith(`avatars/${data.member.id}/`))); keys = []; } };
      assert.equal((await processAccountDeletionCleanup(sim.prisma, result.cleanupId, storage)).delayed, true);
      const later = new Date(Date.now() + 7 * 60000);
      assert.equal((await processAccountDeletionCleanup(sim.prisma, result.cleanupId, storage, later)).retryable, true);
      fail = false; assert.equal((await processAccountDeletionCleanup(sim.prisma, result.cleanupId, storage, later)).completed, true); assert.deepEqual(keys, []);
      assert.equal((await processAccountDeletionCleanup(sim.prisma, result.cleanupId, storage, later)).alreadyCompleted, true);
      status(await sim.call("/api/me/account-deletion", "POST", { password: s.password }, chair), 409);
    });
    await t.test("event create/edit routes enforce origin, input, live capacity and owner permission", async () => {
      const body = { title: "真路由建立模擬活動", location: "合成地點", startAt: "2026-11-01T04:00:00.000Z", capacity: 2 };
      status(await sim.call("/api/events", "POST", body, chair, { origin: null }), 403);
      const gated = await sim.call("/api/events", "POST", body, chair);
      status(gated, 403); assert.equal(gated.data.code, "TERMS_REQUIRED");
      status(await sim.call("/api/me/terms-consent", "POST", { accept: true }, chair), 200);
      status(await sim.call("/api/events", "POST", { ...body, startAt: "invalid" }, chair), 400);
      const created = status(await sim.call("/api/events", "POST", body, chair), 200);
      const path = `/api/events/${created.eventId}`;
      status(await sim.call(path, "PATCH", body, member), 403);
      status(await sim.call(`${path}/register`, "POST", {}, member), 200);
      status(await sim.call(`${path}/register`, "POST", {}, friend), 200);
      status(await sim.call(path, "PATCH", { ...body, capacity: 1 }, chair), 409);
      status(await sim.call(path, "PATCH", { ...body, title: "已更新模擬活動" }, chair), 200);
      assert.equal(status(await sim.call(path, "GET", undefined, member), 200).event.title, "已更新模擬活動");
      status(await sim.call(path, "DELETE", {}, member), 403);
      status(await sim.call(path, "DELETE", {}, chair), 200);
    });
    await t.test("mail adapter failure is retryable and creates no valid stranded token", async () => {
      sim.control.failEmail = true;
      try { status(await sim.call("/api/auth/forgot-password", "POST", { email: s.member.email }), 503); }
      finally { sim.control.failEmail = false; }
      assert.equal(await sim.prisma.passwordResetToken.count({ where: { userId: s.member.user.id, usedAt: null } }), 0);
    });
  } finally { await sim.close(); }
});

test("migration invalidates unbound legacy tokens and creates versioned sessions without erasing members", { timeout: 120000 }, async () => {
  const sim = await createSimulation({ beforeFinalMigration: async db => {
    await db.exec(`INSERT INTO "Organization" (id,level,name,"updatedAt") VALUES ('legacy-club','club','legacy',now());
      INSERT INTO "Member" (id,name,"organizationId","updatedAt") VALUES ('legacy-member','legacy','legacy-club',now());
      INSERT INTO "User" (id,email,"passwordHash","memberId") VALUES ('legacy-user',' Legacy@Example.Test ','test','legacy-member');
      INSERT INTO "EmailVerificationToken" (id,"userId","tokenHash","expiresAt") VALUES ('legacy-verify','legacy-user','old-verify',now()+interval '1 day');
      INSERT INTO "PasswordResetToken" (id,"userId","tokenHash","expiresAt") VALUES ('legacy-reset','legacy-user','old-reset',now()+interval '1 day');`);
  } });
  try {
    assert.equal((await sim.prisma.user.findUnique({ where: { id: "legacy-user" } })).sessionVersion, 1);
    for (const model of [sim.prisma.emailVerificationToken, sim.prisma.passwordResetToken]) { const record = await model.findFirst(); assert.equal(record.email, "legacy@example.test"); assert.ok(record.usedAt); }
    assert.equal(await sim.prisma.member.count(), 1);
  } finally { await sim.close(); }
});
