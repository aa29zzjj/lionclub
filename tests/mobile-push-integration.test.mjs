import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";
const require = createRequire(import.meta.url), { NextRequest } = require("next/server");
const ENV = { MOBILE_PUSH_ENABLED: "true", APNS_ENVIRONMENT: "sandbox", APNS_TOPIC: "com.lionclubsmembership.app", PUSH_DEVICE_ENCRYPTION_KEY: "11".repeat(32) };
const TOKEN = "ab".repeat(32);
const actor = person => ({ userId: person.user.id, memberId: person.id, sessionVersion: person.user.sessionVersion });
async function mobile(sim, person, path, method = "GET", body, tokenOverride) {
  const { signMobileAccessToken } = sim.load("src/lib/mobile-auth.ts");
  const token = tokenOverride ?? (person ? await signMobileAccessToken({ ...actor(person), email: person.email }, new TextEncoder().encode(sim.env.AUTH_SECRET)) : null);
  const request = new NextRequest(`${sim.origin}/api/mobile/push/${path}`, { method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const response = await sim.load(`src/app/api/mobile/push/${path}/route.ts`)[method](request);
  return { status: response.status, data: await response.json(), headers: response.headers };
}
const ok = (response, status = 200) => { assert.equal(response.status, status, JSON.stringify(response.data)); return response.data; };
function domain(sim) { return sim.load("src/lib/mobile-push.ts"); }
function settings(sim) { return sim.load("src/lib/mobile-push-config.ts").mobilePushSettings(sim.env); }
async function queued(sim, suffix) {
  const s = await seedScenario(sim, suffix), now = new Date(Date.now() + 1000), installationId = randomUUID();
  await domain(sim).registerMobilePushDevice(sim.prisma, actor(s.member), { installationId, revision: 1, token: TOKEN, authorization: "granted" }, settings(sim), now);
  const notice = await sim.prisma.eventNotification.create({ data: { eventId: s.event.id, senderId: s.chair.id,
    message: "Synthetic private message must not reach the lock screen", recipients: { create: { recipientId: s.member.id } } } });
  const input = { kind: "activity", sourceId: notice.id, actorId: s.chair.id, recipientMemberIds: [s.member.id] };
  await sim.prisma.$transaction(tx => domain(sim).enqueueMobilePush(tx, input, settings(sim), now));
  const receipt = await sim.prisma.mobilePushReceipt.findFirstOrThrow({ where: { sourceId: notice.id } });
  const delivery = await sim.prisma.mobilePushDelivery.findFirstOrThrow({ where: { receiptId: receipt.id } });
  return { s, now, installationId, notice, input, receipt, delivery };
}

test("push APIs are authenticated and remain compatible with an unmigrated DB while disabled", { timeout: 120000 }, async t => {
  const sim = await createSimulation();
  try {
    const s = await seedScenario(sim, "push-off");
    await sim.database.exec('DROP TABLE "MobilePushDelivery"; DROP TABLE "MobilePushReceipt"; DROP TABLE "MobilePushDevice";');
    await t.test("unauthenticated config/device/feed calls fail before new-table access", async () => {
      for (const [path, method, body] of [["config", "GET"], ["devices", "POST", {}], ["devices", "DELETE", {}], ["receipts", "GET"]]) ok(await mobile(sim, null, path, method, body), 401);
    });
    await t.test("config reports false with no secrets; registration/disable do not pretend success", async () => {
      const response = await mobile(sim, s.member, "config");
      assert.equal(ok(response).enabled, false); assert.equal(response.data.environment, null); assert.equal(response.data.topic, null);
      assert.equal(response.headers.get("cache-control"), "no-store");
      ok(await mobile(sim, s.member, "devices", "POST", {}), 503); ok(await mobile(sim, s.member, "devices", "DELETE", {}), 503);
      const feed = ok(await mobile(sim, s.member, "receipts")); assert.equal(feed.receipts.length, 0); assert.equal(feed.enabled, false);
    });
    await t.test("both existing activity-notification POSTs remain functional with no push schema", async () => {
      const jar = sim.jar(); ok(await sim.call("/api/auth/login", "POST", { email: s.chair.email, password: s.password }, jar));
      ok(await sim.call("/api/notifications", "POST", { eventId: s.event.id, recipientType: "organization" }, jar));
      const { signMobileAccessToken } = sim.load("src/lib/mobile-auth.ts");
      const token = await signMobileAccessToken({ ...actor(s.chair), email: s.chair.email }, new TextEncoder().encode(sim.env.AUTH_SECRET));
      const req = new NextRequest(`${sim.origin}/api/mobile/notifications`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ eventId: s.event.id, recipientType: "organization" }) });
      assert.equal((await sim.load("src/app/api/mobile/notifications/route.ts").POST(req)).status, 200);
      assert.equal(await sim.prisma.eventNotification.count(), 2);
    });
  } finally { await sim.close(); }
});

test("push device APIs persist encrypted, bounded, revision-fenced bindings only for the authenticated account", { timeout: 120000 }, async t => {
  const sim = await createSimulation({ environment: ENV });
  try {
    const s = await seedScenario(sim, "push-devices"), installationId = randomUUID();
    const body = { installationId, revision: 1, token: TOKEN.toUpperCase(), authorization: "granted" };
    await t.test("strict inputs and no caller-selected member/environment", async () => {
      for (const invalid of [{ ...body, userId: s.friend.user.id }, { ...body, authorization: "denied" }, { ...body, revision: 1.2 }, { ...body, installationId: "bad" }, { ...body, token: "zz".repeat(32) }]) ok(await mobile(sim, s.member, "devices", "POST", invalid), 400);
    });
    await t.test("valid registration is encrypted and the same revision is idempotent without extending its 24h lease", async () => {
      const response = ok(await mobile(sim, s.member, "devices", "POST", body));
      const device = await sim.prisma.mobilePushDevice.findUniqueOrThrow({ where: { installationId } });
      assert.equal(device.userId, s.member.user.id); assert.equal(device.memberId, s.member.id); assert.equal(device.revision, 1n);
      assert.equal(device.tokenCiphertext.includes(TOKEN), false); assert.equal(JSON.stringify(response).includes(TOKEN), false);
      assert.equal(device.leaseExpiresAt - device.lastSeenAt, 86400000);
      assert.equal(ok(await mobile(sim, s.member, "devices", "POST", body)).leaseExpiresAt, response.leaseExpiresAt);
      ok(await mobile(sim, s.member, "devices", "POST", { ...body, token: "cd".repeat(32) }), 409);
    });
    await t.test("disable scrubs tokens, keeps its fence and rejects a late registration", async () => {
      ok(await mobile(sim, s.member, "devices", "DELETE", { installationId, revision: 2 }));
      const row = await sim.prisma.mobilePushDevice.findUniqueOrThrow({ where: { installationId } });
      assert.equal(row.enabled, false); assert.equal(row.revision, 2n); assert.equal(row.tokenCiphertext, null); assert.equal(row.tokenHash, null);
      ok(await mobile(sim, s.member, "devices", "POST", body), 409);
      ok(await mobile(sim, s.member, "devices", "POST", { ...body, revision: 2 }), 409);
      ok(await mobile(sim, s.member, "devices", "DELETE", { installationId, revision: 2 }));
      ok(await mobile(sim, s.member, "devices", "POST", { ...body, revision: 3 }));
      ok(await mobile(sim, s.member, "devices", "DELETE", { installationId, revision: 2 }), 409);
    });
    await t.test("a disable before the very first registration creates a tombstone", async () => {
      const fresh = randomUUID();
      ok(await mobile(sim, s.member, "devices", "DELETE", { installationId: fresh, revision: 9 }));
      ok(await mobile(sim, s.member, "devices", "POST", { ...body, installationId: fresh, revision: 8 }), 409);
    });
    await t.test("another account cannot disable an owned installation; a newer authenticated registration rebinds atomically", async () => {
      ok(await mobile(sim, s.friend, "devices", "DELETE", { installationId, revision: 100 }), 409);
      ok(await mobile(sim, s.friend, "devices", "POST", { ...body, revision: 4 }));
      const row = await sim.prisma.mobilePushDevice.findUniqueOrThrow({ where: { installationId } });
      assert.equal(row.userId, s.friend.user.id); assert.equal(row.enabled, true);
      ok(await mobile(sim, s.member, "devices", "POST", { ...body, revision: 3 }), 409);
    });
    await t.test("same APNs token cannot remain enabled under two installations", async () => {
      const fresh = randomUUID();
      ok(await mobile(sim, s.member, "devices", "POST", { ...body, installationId: fresh }));
      const previous = await sim.prisma.mobilePushDevice.findUniqueOrThrow({ where: { installationId } });
      assert.equal(previous.enabled, false); assert.equal(previous.tokenCiphertext, null); assert.equal(previous.revision, 4n);
      assert.equal(await sim.prisma.mobilePushDevice.count({ where: { enabled: true, tokenHash: { not: null } } }), 1);
    });
    await t.test("an inactive/deleted member cannot use an old valid bearer token to register", async () => {
      await sim.prisma.member.update({ where: { id: s.friend.id }, data: { status: "SUSPENDED" } });
      ok(await mobile(sim, s.friend, "devices", "POST", { ...body, installationId: randomUUID(), revision: 5 }), 401);
    });
    await t.test("actor registration rate limiting is backed by the existing database limiter", async () => {
      let limited = false;
      for (let revision = 20; revision < 60; revision++) {
        const response = await mobile(sim, s.chair, "devices", "POST", { installationId: "49df8aee-ab36-4b7f-8361-ac9dd341d4dd", revision, token: "ee".repeat(32), authorization: "granted" });
        if (response.status === 429) { limited = true; assert.ok(Number(response.headers.get("retry-after")) > 0); break; }
        ok(response);
      }
      assert.equal(limited, true);
    });
  } finally { await sim.close(); }
});

test("durable push outbox and worker use synthetic SQL and an injected provider only", { timeout: 180000 }, async t => {
  const sim = await createSimulation({ environment: ENV });
  const worker = sim.load("src/lib/mobile-push-delivery.ts");
  try {
    await t.test("enqueue and provider acceptance are deduplicated and never expose source text in the payload", async () => {
      const q = await queued(sim, "push-accepted");
      await sim.prisma.$transaction(tx => domain(sim).enqueueMobilePush(tx, q.input, settings(sim), q.now));
      assert.equal(await sim.prisma.mobilePushReceipt.count({ where: { sourceId: q.notice.id } }), 1);
      assert.equal(await sim.prisma.mobilePushDelivery.count({ where: { receiptId: q.receipt.id } }), 1);
      let sends = 0;
      const send = async request => { sends++; assert.equal(request.token, TOKEN); assert.equal(request.payload.data.version, 1); assert.equal(request.payload.data.kind, "activity");
        assert.equal(request.payload.aps.alert.body, "你有一則新的通知，開啟 App 查看。"); assert.equal(JSON.stringify(request.payload).includes(q.notice.message), false); return { kind: "accepted" }; };
      assert.equal((await worker.deliverMobilePush(sim.prisma, q.delivery.id, send, settings(sim), q.now)).status, "accepted");
      assert.equal((await worker.deliverMobilePush(sim.prisma, q.delivery.id, send, settings(sim), q.now)).status, "accepted");
      assert.equal(sends, 1); assert.equal((await sim.prisma.mobilePushDelivery.findUniqueOrThrow({ where: { id: q.delivery.id } })).status, "ACCEPTED");
    });
    await t.test("concurrent worker calls have only one active SQL claim", async () => {
      const q = await queued(sim, "push-claim"), received = Promise.withResolvers(), release = Promise.withResolvers(); let sends = 0;
      const first = worker.deliverMobilePush(sim.prisma, q.delivery.id, async () => { sends++; received.resolve(); await release.promise; return { kind: "accepted" }; }, settings(sim), q.now);
      await received.promise;
      assert.equal((await worker.deliverMobilePush(sim.prisma, q.delivery.id, async () => { assert.fail("duplicate provider call"); }, settings(sim), q.now)).status, "busy");
      release.resolve(); assert.equal((await first).status, "accepted"); assert.equal(sends, 1);
    });
    for (const condition of ["session-revoked", "blocked-sender", "inactive-sender", "expired-lease", "already-read", "wrong-binding"]) {
      await t.test(`${condition}: eligibility is rechecked before provider transmission`, async () => {
        const q = await queued(sim, `push-${condition}`);
        if (condition === "session-revoked") await sim.prisma.user.update({ where: { id: q.s.member.user.id }, data: { sessionVersion: { increment: 1 } } });
        if (condition === "blocked-sender") await sim.prisma.memberBlock.create({ data: { blockerId: q.s.member.id, blockedId: q.s.chair.id } });
        if (condition === "inactive-sender") await sim.prisma.member.update({ where: { id: q.s.chair.id }, data: { status: "SUSPENDED" } });
        if (condition === "expired-lease") await sim.prisma.mobilePushDevice.update({ where: { installationId: q.installationId }, data: { enabled: false, tokenHash: null, tokenCiphertext: null, leaseExpiresAt: q.now } });
        if (condition === "already-read") await sim.prisma.eventNotificationRecipient.updateMany({ where: { notificationId: q.notice.id }, data: { readAt: q.now } });
        if (condition === "wrong-binding") await sim.prisma.mobilePushDevice.update({ where: { installationId: q.installationId }, data: { bindingVersion: { increment: 1 } } });
        const result = await worker.deliverMobilePush(sim.prisma, q.delivery.id, async () => { assert.fail("Unauthorized provider request"); }, settings(sim), q.now);
        assert.equal(result.status, "discarded");
      });
    }
    await t.test("expired delivery cannot be sent even if its device is later renewed", async () => {
      const q = await queued(sim, "push-expired");
      assert.equal((await worker.deliverMobilePush(sim.prisma, q.delivery.id, async () => { assert.fail("Expired provider call"); }, settings(sim), new Date(q.now.getTime() + 86400001))).status, "discarded");
    });
    await t.test("account deletion cascades the device, generic receipts and pending deliveries", async () => {
      const q = await queued(sim, "push-account-delete");
      await sim.prisma.user.delete({ where: { id: q.s.member.user.id } });
      assert.equal(await sim.prisma.mobilePushDevice.findUnique({ where: { installationId: q.installationId } }), null);
      assert.equal(await sim.prisma.mobilePushReceipt.findUnique({ where: { id: q.receipt.id } }), null);
      assert.equal(await sim.prisma.mobilePushDelivery.findUnique({ where: { id: q.delivery.id } }), null);
    });
    await t.test("newer account binding removes queued deliveries for the previous account", async () => {
      const q = await queued(sim, "push-switch-account");
      await domain(sim).registerMobilePushDevice(sim.prisma, actor(q.s.friend), { installationId: q.installationId, revision: 2, token: TOKEN, authorization: "granted" }, settings(sim), q.now);
      assert.equal(await sim.prisma.mobilePushDelivery.findUnique({ where: { id: q.delivery.id } }), null);
      assert.equal((await worker.deliverMobilePush(sim.prisma, q.delivery.id, async () => { assert.fail("Stale account push"); }, settings(sim), q.now)).status, "missing");
    });
    await t.test("explicit invalid-token response disables and scrubs the matching registration", async () => {
      const q = await queued(sim, "push-invalid-token");
      assert.equal((await worker.deliverMobilePush(sim.prisma, q.delivery.id, async () => ({ kind: "invalid-token" }), settings(sim), q.now)).status, "discarded");
      const device = await sim.prisma.mobilePushDevice.findUniqueOrThrow({ where: { installationId: q.installationId } });
      assert.equal(device.enabled, false); assert.equal(device.tokenCiphertext, null); assert.equal(device.tokenHash, null);
    });
    await t.test("provider rejection, ambiguous network outcome and abandoned claims are not blindly retried", async () => {
      for (const reason of ["rejected", "throws", "abandoned"]) {
        const q = await queued(sim, `push-outcome-${reason}`); let sends = 0;
        if (reason === "abandoned") await sim.prisma.mobilePushDelivery.update({ where: { id: q.delivery.id }, data: { status: "SENDING", lockId: randomUUID(), lockedAt: new Date(q.now.getTime() - 360000), attemptCount: 1 } });
        const provider = async () => { sends++; if (reason === "throws") throw Error("Synthetic ambiguous network failure with private data"); return { kind: "rejected" }; };
        assert.equal((await worker.deliverMobilePush(sim.prisma, q.delivery.id, provider, settings(sim), q.now)).status, "discarded");
        assert.equal((await worker.deliverMobilePush(sim.prisma, q.delivery.id, provider, settings(sim), q.now)).status, "discarded");
        assert.equal(sends, reason === "abandoned" ? 0 : 1);
        const row = await sim.prisma.mobilePushDelivery.findUniqueOrThrow({ where: { id: q.delivery.id } }); assert.equal(row.lastErrorCode.includes("private"), false);
      }
    });
    await t.test("known nonaccepted retryable responses back off and stop at five attempts", async () => {
      const q = await queued(sim, "push-retry"); let now = q.now, sends = 0;
      const provider = async () => { sends++; return { kind: "retryable", reason: "rate-limited" }; };
      for (let i = 1; i <= 5; i++) {
        assert.equal((await worker.deliverMobilePush(sim.prisma, q.delivery.id, provider, settings(sim), now)).status, i < 5 ? "retry" : "discarded");
        const row = await sim.prisma.mobilePushDelivery.findUniqueOrThrow({ where: { id: q.delivery.id } }); assert.equal(row.attemptCount, i); now = row.availableAt;
      }
      assert.equal(sends, 5);
    });
  } finally { await sim.close(); }
});

test("generic review receipt feed is account-owned and rechecks current source, actor, block and role", { timeout: 120000 }, async t => {
  const sim = await createSimulation({ environment: ENV });
  try {
    const s = await seedScenario(sim, "push-receipt-feed"), updated = await sim.prisma.member.findUniqueOrThrow({ where: { id: s.member.id } });
    const input = { kind: "membership_review", sourceId: updated.id, sourceRevision: updated.updatedAt.toISOString(), actorId: s.chair.id, recipientMemberIds: [s.member.id] };
    await sim.prisma.$transaction(tx => domain(sim).enqueueMobilePush(tx, input, settings(sim)));
    const row = await sim.prisma.mobilePushReceipt.findFirstOrThrow({ where: { memberId: s.member.id } });
    await t.test("only generic reviewer status copy and opaque receipt IDs reach the API", async () => {
      const response = ok(await mobile(sim, s.member, "receipts")); assert.equal(response.receipts.length, 1); assert.equal(response.unreadCount, 1);
      assert.equal(response.receipts[0].id, row.id); assert.equal(response.receipts[0].kind, "membership_review");
      assert.equal(JSON.stringify(response).includes(s.chair.name), false); assert.equal(JSON.stringify(response).includes(input.sourceId), false);
      assert.equal(JSON.stringify(response).includes(s.member.email), false);
    });
    await t.test("another authenticated member sees and modifies none of the owner's receipts", async () => {
      assert.equal(ok(await mobile(sim, s.friend, "receipts")).receipts.length, 0);
      assert.equal(ok(await mobile(sim, s.friend, "receipts", "PATCH", { ids: [row.id] })).updatedCount, 0);
      assert.equal((await sim.prisma.mobilePushReceipt.findUniqueOrThrow({ where: { id: row.id } })).readAt, null);
      assert.equal(ok(await mobile(sim, s.member, "receipts", "PATCH", { ids: [row.id] })).updatedCount, 1);
      assert.equal(ok(await mobile(sim, s.member, "receipts")).unreadCount, 0);
    });
    await t.test("later profile/review changes make an old membership-result receipt unavailable", async () => {
      await sim.prisma.member.update({ where: { id: s.member.id }, data: { bio: "Synthetic later profile revision" } });
      assert.equal(ok(await mobile(sim, s.member, "receipts")).receipts.length, 0);
    });
    await t.test("receipts cannot be manufactured for a recipient unrelated to a source", async () => {
      const result = await sim.prisma.$transaction(tx => domain(sim).enqueueMobilePush(tx, { ...input, recipientMemberIds: [s.friend.id] }, settings(sim)));
      assert.equal(result.receiptCount, 0);
    });
  } finally { await sim.close(); }
});
