import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

// Real routes + shared review service + Prisma + disposable PostgreSQL SQL.
// No production credentials, APNs calls, cloud resources or real member data.
const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const enabled = { MOBILE_PUSH_ENABLED: "true", APNS_ENVIRONMENT: "sandbox", APNS_TOPIC: "com.lionclubsmembership.app", PUSH_DEVICE_ENCRYPTION_KEY: "11".repeat(32) };
const expectStatus = (response, status) => { assert.equal(response.status, status, JSON.stringify(response.data)); return response.data; };

async function actors(sim, suffix) {
  const s = await seedScenario(sim, suffix);
  const jars = new Map();
  for (const member of [s.member, s.friend, s.chair]) {
    const jar = sim.jar();
    expectStatus(await sim.call("/api/auth/login", "POST", { email: member.email, password: s.password }, jar), 200);
    jars.set(member.id, jar);
  }
  async function post(platform, file, body, member = s.chair, params = {}, options = {}) {
    if (platform === "web") {
      const path = "/api/" + file.replace(/\[([^\]]+)\]/g, (_, key) => params[key]);
      return sim.call(path, "POST", body, jars.get(member.id), options);
    }
    const { signMobileAccessToken } = sim.load("src/lib/mobile-auth.ts");
    const token = await signMobileAccessToken({ userId: member.user.id, memberId: member.id, email: member.email, sessionVersion: member.user.sessionVersion }, new TextEncoder().encode(sim.env.AUTH_SECRET));
    const handler = sim.load(`src/app/api/mobile/${file}/route.ts`).POST;
    const request = new NextRequest(`${sim.origin}/api/mobile/${file.replace(/\[([^\]]+)\]/g, (_, key) => params[key])}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const response = await handler(request, { params: Promise.resolve(params) });
    return { status: response.status, data: await response.json() };
  }
  async function pending(id) {
    return sim.prisma.member.create({ data: {
      id, name: "Synthetic private pending applicant", email: `${id}@example.test`, organizationId: s.ai.id, status: "PENDING",
      user: { create: { email: `${id}@example.test`, passwordHash: s.member.user.passwordHash } },
    }, include: { user: true } });
  }
  async function experience(extra = {}) {
    return sim.prisma.memberExperience.create({ data: {
      memberId: s.member.id, kind: "position", level: "club", positionCode: "club_secretary", organizationId: s.ai.id,
      organizationName: s.ai.name, startYear: 2026, endYear: 2026, datePrecision: "lions_year", isCurrent: true,
      verificationStatus: "under_review", ...extra,
    } });
  }
  return { s, post, pending, experience };
}

function failReceiptWrites(sim) {
  const transaction = sim.prisma.$transaction.bind(sim.prisma);
  sim.prisma.$transaction = (work, options) => transaction(tx => work(new Proxy(tx, { get(target, key) {
    if (key === "mobilePushReceipt") return new Proxy(target[key], { get(delegate, method) {
      if (["create", "createMany", "upsert"].includes(String(method))) return async () => { throw Error("SIMULATED_PUSH_RECEIPT_FAILURE"); };
      const value = Reflect.get(delegate, method); return typeof value === "function" ? value.bind(delegate) : value;
    } });
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } })), options);
  return () => { sim.prisma.$transaction = transaction; };
}

test("push disabled leaves both platforms' invitation and review mutations usable without the new tables", { timeout: 180000 }, async t => {
  const sim = await createSimulation();
  try {
    const { s, post, pending, experience } = await actors(sim, "push-events-disabled");
    await sim.prisma.friendship.deleteMany({});
    await sim.database.exec('DROP TABLE "MobilePushDelivery"; DROP TABLE "MobilePushReceipt"; DROP TABLE "MobilePushDevice";');
    for (const [platform, sender] of [["web", s.member], ["mobile", s.chair]]) {
      await t.test(`${platform}: no push-table access while feature is off`, async () => {
        expectStatus(await post(platform, "friends/request", { memberId: s.friend.id }, sender), 200);
        const applicant = await pending(`disabled-pending-${platform}`);
        expectStatus(await post(platform, "admin/pending-members/[memberId]", { action: "approve" }, s.chair, { memberId: applicant.id }), 200);
        const row = await experience();
        expectStatus(await post(platform, "admin/pending-experiences/[experienceId]", { action: "verify", expectedUpdatedAt: row.updatedAt.toISOString() }, s.chair, { experienceId: row.id }), 200);
      });
    }
  } finally { await sim.close(); }
});

test("new search invitations enqueue exactly one recipient receipt and never send another invitation for QR/duplicates/blocks", { timeout: 180000 }, async t => {
  const sim = await createSimulation({ environment: enabled });
  try {
    const { s, post } = await actors(sim, "push-events-friends");
    await sim.prisma.friendship.deleteMany({});
    for (const [platform, requester, addressee] of [["web", s.member, s.friend], ["mobile", s.chair, s.friend]]) {
      await t.test(`${platform}: successful PENDING write has one minimal receipt; replay has none`, async () => {
        const created = expectStatus(await post(platform, "friends/request", { memberId: addressee.id }, requester), 200);
        const friendship = await sim.prisma.friendship.findUniqueOrThrow({ where: { id: created.friendshipId } });
        assert.equal(friendship.status, "PENDING"); assert.equal(friendship.source, "SEARCH");
        const receipts = await sim.prisma.mobilePushReceipt.findMany({ where: { kind: "friend_invitation", sourceId: created.friendshipId } });
        assert.equal(receipts.length, 1); assert.equal(receipts[0].memberId, addressee.id); assert.equal(receipts[0].actorId, requester.id);
        assert.equal(receipts[0].userId, addressee.user.id);
        for (const key of ["name", "email", "phone", "message", "reason"]) assert.equal(key in receipts[0], false);
        expectStatus(await post(platform, "friends/request", { memberId: addressee.id }, requester), 409);
        assert.equal(await sim.prisma.mobilePushReceipt.count({ where: { sourceId: created.friendshipId } }), 1);
      });
    }
    await t.test("blocked/self/unknown/cross-origin actors cannot create a receipt", async () => {
      const before = await sim.prisma.mobilePushReceipt.count();
      await sim.prisma.memberBlock.create({ data: { blockerId: s.chair.id, blockedId: s.member.id } });
      for (const platform of ["web", "mobile"]) {
        expectStatus(await post(platform, "friends/request", { memberId: s.chair.id }, s.member), 403);
        expectStatus(await post(platform, "friends/request", { memberId: s.member.id }, s.member), 400);
        expectStatus(await post(platform, "friends/request", { memberId: "does-not-exist" }, s.member), 404);
      }
      expectStatus(await post("web", "friends/request", { memberId: s.chair.id }, s.friend, {}, { origin: "https://untrusted.example.test" }), 403);
      assert.equal(await sim.prisma.mobilePushReceipt.count(), before);
      await sim.prisma.memberBlock.deleteMany({});
    });
    await t.test("QR accepting an existing pending request does not enqueue a second invitation", async () => {
      const before = await sim.prisma.mobilePushReceipt.count();
      expectStatus(await post("mobile", "friends/qr-add", { memberId: s.member.id }, s.friend), 200);
      const relationship = await sim.prisma.friendship.findFirst({ where: { requesterId: s.member.id, addresseeId: s.friend.id } });
      assert.equal(relationship.status, "ACCEPTED");
      assert.equal(await sim.prisma.mobilePushReceipt.count(), before);
      assert.equal(await sim.prisma.mobilePushDelivery.count(), 0, "without a leased registered device there is no network-delivery job");
    });
  } finally { await sim.close(); }
});

test("membership approval enqueues its exact committed revision once; rejection without a login fails closed", { timeout: 180000 }, async t => {
  const sim = await createSimulation({ environment: enabled });
  try {
    const { s, post, pending } = await actors(sim, "push-events-membership");
    for (const platform of ["web", "mobile"]) {
      await t.test(`${platform}: permissions/CAS remain enforced, one approval receipt only`, async () => {
        const applicant = await pending(`enabled-pending-${platform}`);
        const params = { memberId: applicant.id };
        const before = await sim.prisma.mobilePushReceipt.count();
        expectStatus(await post(platform, "admin/pending-members/[memberId]", { action: "approve" }, s.member, params), 403);
        assert.equal(await sim.prisma.mobilePushReceipt.count(), before);
        assert.equal((await sim.prisma.member.findUniqueOrThrow({ where: { id: applicant.id } })).status, "PENDING");
        expectStatus(await post(platform, "admin/pending-members/[memberId]", { action: "approve" }, s.chair, params), 200);
        const saved = await sim.prisma.member.findUniqueOrThrow({ where: { id: applicant.id } });
        const receipt = await sim.prisma.mobilePushReceipt.findFirstOrThrow({ where: { kind: "membership_review", sourceId: applicant.id } });
        assert.equal(saved.status, "ACTIVE"); assert.equal(receipt.sourceRevision, saved.updatedAt.toISOString());
        assert.equal(receipt.memberId, applicant.id); assert.equal(receipt.actorId, s.chair.id); assert.equal(receipt.userId, applicant.user.id);
        expectStatus(await post(platform, "admin/pending-members/[memberId]", { action: "approve" }, s.chair, params), 409);
        assert.equal(await sim.prisma.mobilePushReceipt.count({ where: { sourceId: applicant.id } }), 1);
      });
      await t.test(`${platform}: rejection removes the old login and creates no unusable push receipt`, async () => {
        const applicant = await pending(`rejected-pending-${platform}`);
        const before = await sim.prisma.mobilePushReceipt.count();
        expectStatus(await post(platform, "admin/pending-members/[memberId]", { action: "reject" }, s.chair, { memberId: applicant.id }), 200);
        assert.equal(await sim.prisma.member.findUnique({ where: { id: applicant.id } }), null);
        assert.equal(await sim.prisma.user.findUnique({ where: { id: applicant.user.id } }), null);
        assert.equal(await sim.prisma.mobilePushReceipt.count(), before);
      });
    }
  } finally { await sim.close(); }
});

test("both experience review routes enqueue the new audit only after a permitted state change", { timeout: 180000 }, async t => {
  const sim = await createSimulation({ environment: enabled });
  try {
    const { s, post, experience } = await actors(sim, "push-events-experience");
    for (const platform of ["web", "mobile"]) for (const action of ["verify", "reject"]) {
      await t.test(`${platform}/${action}: one audit-derived receipt, no private reason`, async () => {
        const row = await experience(), params = { experienceId: row.id };
        const body = { action, expectedUpdatedAt: row.updatedAt.toISOString(), reviewReason: "Synthetic private review reason - must never appear on lock screen" };
        const before = await sim.prisma.mobilePushReceipt.count();
        expectStatus(await post(platform, "admin/pending-experiences/[experienceId]", body, s.member, params), 403);
        expectStatus(await post(platform, "admin/pending-experiences/[experienceId]", { ...body, expectedUpdatedAt: "2000-01-01T00:00:00Z" }, s.chair, params), 409);
        assert.equal(await sim.prisma.mobilePushReceipt.count(), before);
        expectStatus(await post(platform, "admin/pending-experiences/[experienceId]", body, s.chair, params), 200);
        const audit = await sim.prisma.experienceReviewAudit.findFirstOrThrow({ where: { experienceId: row.id } });
        const receipt = await sim.prisma.mobilePushReceipt.findFirstOrThrow({ where: { kind: "experience_review", sourceId: audit.id } });
        assert.equal(audit.actorId, s.chair.id); assert.equal(receipt.actorId, s.chair.id); assert.equal(receipt.memberId, s.member.id);
        assert.equal(JSON.stringify(receipt).includes(body.reviewReason), false);
        expectStatus(await post(platform, "admin/pending-experiences/[experienceId]", body, s.chair, params), 404);
        assert.equal(await sim.prisma.mobilePushReceipt.count({ where: { sourceId: audit.id } }), 1);
      });
    }
  } finally { await sim.close(); }
});

test("receipt persistence failure rolls back its original invitation/approval/audit transaction", { timeout: 180000 }, async t => {
  const sim = await createSimulation({ environment: enabled });
  try {
    const { s, post, pending, experience } = await actors(sim, "push-events-rollback");
    await sim.prisma.friendship.deleteMany({});
    for (const platform of ["web", "mobile"]) {
      await t.test(`${platform}: invitation and receipt are atomic`, async () => {
        const restore = failReceiptWrites(sim);
        try { await assert.rejects(post(platform, "friends/request", { memberId: s.friend.id }, s.member), /SIMULATED_PUSH_RECEIPT_FAILURE/); }
        finally { restore(); }
        assert.equal(await sim.prisma.friendship.count(), 0); assert.equal(await sim.prisma.mobilePushReceipt.count(), 0);
      });
      await t.test(`${platform}: membership status and receipt are atomic`, async () => {
        const applicant = await pending(`rollback-pending-${platform}`), restore = failReceiptWrites(sim);
        try { await assert.rejects(post(platform, "admin/pending-members/[memberId]", { action: "approve" }, s.chair, { memberId: applicant.id }), /SIMULATED_PUSH_RECEIPT_FAILURE/); }
        finally { restore(); }
        assert.equal((await sim.prisma.member.findUniqueOrThrow({ where: { id: applicant.id } })).status, "PENDING");
        assert.equal(await sim.prisma.mobilePushReceipt.count(), 0);
      });
      await t.test(`${platform}: experience status, audit and receipt are atomic`, async () => {
        const row = await experience(), restore = failReceiptWrites(sim);
        try { await assert.rejects(post(platform, "admin/pending-experiences/[experienceId]", { action: "verify", expectedUpdatedAt: row.updatedAt.toISOString() }, s.chair, { experienceId: row.id }), /SIMULATED_PUSH_RECEIPT_FAILURE/); }
        finally { restore(); }
        assert.equal((await sim.prisma.memberExperience.findUniqueOrThrow({ where: { id: row.id } })).verificationStatus, "under_review");
        assert.equal(await sim.prisma.experienceReviewAudit.count({ where: { experienceId: row.id } }), 0);
        assert.equal(await sim.prisma.mobilePushReceipt.count(), 0);
      });
    }
  } finally { await sim.close(); }
});
