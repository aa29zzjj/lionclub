import assert from "node:assert/strict";
import { test } from "node:test";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server.js";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

// Real route handlers, SQL transactions and bearer verification. Only the
// database, browser cookie store and email transport are test-owned adapters.
const CLUB_ID = "seed-club-300A-1-聖迪獅子會";
const expectStatus = (result, expected) => {
  assert.equal(result.status, expected, JSON.stringify(result.data));
  return result.data;
};
async function mobile(sim, file, method = "GET", body, bearer) {
  const headers = new Headers({ "x-forwarded-for": "192.0.2.81" });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
  const request = new NextRequest(`${sim.origin}/api/mobile/${file}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const response = await sim.load(`src/app/api/mobile/${file}/route.ts`)[method](request);
  return { status: response.status, data: await response.json(), headers: response.headers };
}

test("Shengdi event invitation opens the correct club immediately, with membership awaiting manual verification", { timeout: 180000 }, async t => {
  const sim = await createSimulation({ environment: {
    FEDERATED_AUTH_ENABLED: "true", GOOGLE_OAUTH_CLIENT_ID: "synthetic-client", GOOGLE_OAUTH_CLIENT_SECRET: "synthetic-secret",
  } });
  try {
    const base = await seedScenario(sim);
    const club = await sim.prisma.organization.create({ data: { id: CLUB_ID, level: "club", name: "聖迪獅子會", districtCode: "300A-1" } });
    const chair = await sim.prisma.member.create({ data: {
      name: "合成聖迪會長", email: "shengdi-chair@example.test", organizationId: club.id, status: "ACTIVE",
      user: { create: { email: "shengdi-chair@example.test", passwordHash: await bcrypt.hash(base.password, 4) } },
      adminRoles: { create: { role: "CLUB_PRESIDENT", scopeType: "club", scopeId: club.id } },
    } });
    let inviteCounter = 0;
    const invite = (extra = {}) => sim.prisma.clubInvite.create({ data: {
      organizationId: club.id, issuedById: chair.id, pin: "unused", token: `shengdi-test-${++inviteCounter}`,
      validUntil: new Date(Date.now() + 72 * 60 * 60 * 1000), ...extra,
    } });
    const signup = (email, token, extra = {}, jar = sim.jar()) => sim.call("/api/auth/register", "POST", {
      name: "合成申請人", email, password: base.password, token, privacyConsent: true, termsConsent: true, ...extra,
    }, jar);
    async function webLogin(person) {
      const jar = sim.jar();
      expectStatus(await sim.call("/api/auth/login", "POST", { email: person.email, password: base.password }, jar), 200);
      return jar;
    }
    const liveInvite = await invite();
    let applicant;

    await t.test("verified invite identifies direct club enrollment, 72-hour lifetime and uncached lookup", async () => {
      const response = await sim.call(`/api/invites/verify?token=${liveInvite.token}`);
      const data = expectStatus(response, 200);
      assert.equal(data.valid, true); assert.equal(data.approvalRequired, false); assert.equal(data.registrationMode, "direct_club");
      assert.equal(data.organizationId, club.id); assert.equal(data.organizationName, club.name);
      assert.match(response.headers.get("Cache-Control"), /no-store/);
      assert.ok(Math.abs((+liveInvite.validUntil - +liveInvite.validFrom) - 72 * 3600000) < 5000);
    });

    await t.test("signup immediately opens Shengdi, replaces any previous session and grants no administrative privileges", async () => {
      const jar = await webLogin(base.member);
      const previousSession = jar.get("lionclub_session"); assert.ok(previousSession);
      const result = expectStatus(await signup("shengdi-applicant@example.test", liveInvite.token, {
        organizationId: club.id, declaredOrganizationName: "不應覆蓋邀請中的分會", mode: "central", status: "PENDING", role: "CLUB_PRESIDENT",
      }, jar), 200);
      assert.equal(result.registrationMode, "direct_club"); assert.equal(result.canLogin, true);
      assert.equal(result.organizationName, club.name); assert.equal(result.organizationAssignmentStatus, "NEEDS_ASSIGNMENT");
      assert.ok(jar.has("lionclub_session")); assert.notEqual(jar.get("lionclub_session"), previousSession);
      applicant = await sim.prisma.member.findUniqueOrThrow({ where: { id: result.memberId }, include: { user: true } });
      assert.equal(applicant.status, "ACTIVE"); assert.equal(applicant.organizationId, club.id);
      assert.equal(applicant.declaredOrganizationName, club.name); assert.equal(applicant.role, "MEMBER");
      assert.equal(applicant.organizationAssignmentVersion, 0); assert.equal(applicant.joinYear, null); assert.equal(applicant.joinMonth, null);
      assert.equal(await sim.prisma.adminRole.count({ where: { memberId: applicant.id } }), 0);
      const records = await sim.prisma.memberOrganizationAssignment.findMany({ where: { memberId: applicant.id } });
      assert.equal(records.length, 1); assert.equal(records[0].toOrganizationId, club.id);
      assert.equal(records[0].assignmentStatus, "NEEDS_ASSIGNMENT"); assert.equal(records[0].assignedById, null);
      assert.match(records[0].reason, /人工核對/);
      assert.equal((await sim.prisma.clubInvite.findUniqueOrThrow({ where: { id: liveInvite.id } })).usageCount, 1);
      const me = expectStatus(await sim.call("/api/me", "GET", undefined, jar), 200);
      assert.equal(me.id, applicant.id); assert.equal(me.organization.id, club.id);
      expectStatus(await sim.call("/api/admin/pending-members", "GET", undefined, jar), 403);
    });

    await t.test("the current native app can log in with the same password and receives the correct ordinary-member identity", async () => {
      const body = { email: applicant.email, password: base.password };
      const login = expectStatus(await mobile(sim, "auth/login", "POST", body), 200);
      assert.ok(login.accessToken); assert.ok(login.refreshToken); assert.equal(login.memberId, applicant.id);
      const me = expectStatus(await mobile(sim, "me", "GET", undefined, login.accessToken), 200);
      assert.equal(me.id, applicant.id); assert.equal(me.organization.id, club.id); assert.equal(me.status, "ACTIVE");
      assert.equal(me.joinYear, null); assert.equal(me.joinMonth, null); assert.equal(me.adminRoles.length, 0);
      expectStatus(await mobile(sim, "admin/pending-members", "GET", undefined, login.accessToken), 403);
      expectStatus(await mobile(sim, "me"), 401);
      const jar = await webLogin(applicant);
      assert.equal(expectStatus(await sim.call("/api/me", "GET", undefined, jar), 200).organization.id, club.id);
    });

    await t.test("welcome email accurately explains immediate access and later manual membership verification", async () => {
      const welcome = sim.inbox.find(mail => mail.to === applicant.email && !mail.subject.includes("驗證"));
      assert.ok(welcome); assert.match(welcome.text, /聖迪獅子會/); assert.match(welcome.text, /核對/);
      assert.doesNotMatch(welcome.text, /等候會長.*核准|實際.*AI臺科大/);
    });

    await t.test("later list verification remains restricted to the authorized club president and records the human decision", async () => {
      const body = { organizationId: club.id, expectedOrganizationId: club.id, expectedAssignmentVersion: 0, reason: "合成活動名單已人工核對" };
      const path = `/api/admin/member-assignments/${applicant.id}`;
      const memberJar = await webLogin(applicant), otherChairJar = await webLogin(base.chair), chairJar = await webLogin(chair);
      expectStatus(await sim.call(path, "POST", body, memberJar), 403);
      expectStatus(await sim.call(path, "POST", body, otherChairJar), 404);
      const confirmed = expectStatus(await sim.call(path, "POST", body, chairJar), 200);
      assert.equal(confirmed.organizationAssignmentStatus, "ASSIGNED");
      const updated = await sim.prisma.member.findUniqueOrThrow({ where: { id: applicant.id } });
      assert.equal(updated.status, "ACTIVE"); assert.equal(updated.organizationId, club.id); assert.equal(updated.organizationAssignmentVersion, 1);
      const records = await sim.prisma.memberOrganizationAssignment.findMany({ where: { memberId: applicant.id }, orderBy: { assignedAt: "asc" } });
      assert.equal(records.length, 2); assert.equal(records[1].assignedById, chair.id); assert.equal(records[1].reason, body.reason);
      assert.equal(records[1].assignmentStatus, "ASSIGNED"); assert.equal(await sim.prisma.adminRole.count({ where: { memberId: applicant.id } }), 0);
      expectStatus(await sim.call(path, "POST", body, chairJar), 409);
    });

    await t.test("caller-provided org and mode cannot override the organization stored on an invite", async () => {
      expectStatus(await signup("forged-org@example.test", base.invite.token, { organizationId: club.id, mode: "direct_club" }), 400);
      expectStatus(await signup("forged-reverse@example.test", liveInvite.token, { organizationId: base.ai.id, mode: "central" }), 400);
      const result = expectStatus(await signup("central-unchanged@example.test", base.invite.token, { mode: "direct_club", declaredOrganizationName: club.name }), 200);
      assert.equal(result.canLogin, true); assert.equal(result.registrationMode, "central");
      const member = await sim.prisma.member.findUniqueOrThrow({ where: { id: result.memberId } });
      assert.equal(member.organizationId, base.ai.id); assert.equal(member.status, "ACTIVE");
      assert.equal(await sim.prisma.memberOrganizationAssignment.count({ where: { memberId: member.id } }), 1);
      assert.equal((await sim.prisma.clubInvite.findUniqueOrThrow({ where: { id: liveInvite.id } })).usageCount, 1);
    });

    await t.test("an already verified OAuth signup cannot bypass the event's password requirement or consume its invitation", async () => {
      const protocol = sim.load("src/lib/federated-auth.ts");
      const state = protocol.randomOAuthSecret(), browser = protocol.randomOAuthSecret();
      const invitation = await invite();
      const flow = await sim.prisma.oAuthTransaction.create({ data: {
        provider: "google", purpose: "login", stateHash: protocol.hashOAuthSecret(state), browserHash: protocol.hashOAuthSecret(browser),
        nonce: "synthetic-nonce", inviteToken: invitation.token, expiresAt: new Date(Date.now() + 60000),
        claimedAt: new Date(), verifiedAt: new Date(), subject: "synthetic-event-oauth", email: "stale-oauth@example.test",
      } });
      const jar = sim.jar(); jar.set("lionclub_oauth_browser", browser); jar.set("lionclub_oauth_pending", state);
      const response = expectStatus(await sim.call("/api/auth/oauth/register", "POST", {
        name: "合成OAuth申請", privacyConsent: true, termsConsent: true, oauthConsent: true,
      }, jar), 400);
      assert.match(response.error, /Email.*密碼|密碼.*Email|密碼/);
      assert.equal(await sim.prisma.user.count({ where: { email: "stale-oauth@example.test" } }), 0);
      assert.equal(await sim.prisma.member.count({ where: { email: "stale-oauth@example.test" } }), 0);
      assert.equal(await sim.prisma.federatedIdentity.count({ where: { subject: "synthetic-event-oauth" } }), 0);
      assert.equal((await sim.prisma.clubInvite.findUniqueOrThrow({ where: { id: invitation.id } })).usageCount, 0);
      assert.equal((await sim.prisma.oAuthTransaction.findUniqueOrThrow({ where: { id: flow.id } })).completedAt, null);
      assert.equal(jar.has("lionclub_session"), false);
    });

    await t.test("missing terms, privacy consent or trusted browser origin cannot consume invitation quota", async () => {
      const before = (await sim.prisma.clubInvite.findUniqueOrThrow({ where: { id: liveInvite.id } })).usageCount;
      expectStatus(await signup("no-terms@example.test", liveInvite.token, { termsConsent: false }), 400);
      expectStatus(await signup("no-privacy@example.test", liveInvite.token, { privacyConsent: false }), 400);
      expectStatus(await sim.call("/api/auth/register", "POST", {
        name: "合成", email: "bad-origin@example.test", password: base.password, token: liveInvite.token, privacyConsent: true, termsConsent: true,
      }, sim.jar(), { origin: null }), 403);
      assert.equal((await sim.prisma.clubInvite.findUniqueOrThrow({ where: { id: liveInvite.id } })).usageCount, before);
    });

    await t.test("expired, future, revoked, exhausted and unknown invitations cannot create accounts or consume quota", async () => {
      const cases = [
        { validUntil: new Date(Date.now() - 1000) }, { validFrom: new Date(Date.now() + 3600000) },
        { revokedAt: new Date() }, { usageLimit: 1, usageCount: 1 },
      ];
      for (const [index, data] of cases.entries()) {
        const invalid = await invite(data); const before = await sim.prisma.member.count();
        assert.equal(expectStatus(await sim.call(`/api/invites/verify?token=${invalid.token}`), 200).valid, false);
        expectStatus(await signup(`invalid-${index}@example.test`, invalid.token), 400);
        assert.equal(await sim.prisma.member.count(), before);
        assert.equal((await sim.prisma.clubInvite.findUniqueOrThrow({ where: { id: invalid.id } })).usageCount, data.usageCount ?? 0);
      }
      expectStatus(await signup("unknown-token@example.test", "unknown-shengdi-token"), 400);
    });

    await t.test("a disabled club fails closed without falling back to central intake", async () => {
      const invitation = await invite();
      await sim.prisma.organization.update({ where: { id: club.id }, data: { isActive: false } });
      try {
        expectStatus(await signup("inactive-club@example.test", invitation.token), 400);
        assert.equal(await sim.prisma.user.count({ where: { email: "inactive-club@example.test" } }), 0);
      } finally { await sim.prisma.organization.update({ where: { id: club.id }, data: { isActive: true } }); }
    });

    await t.test("the last invitation slot is consumed once under simultaneous registration", async () => {
      const last = await invite({ usageLimit: 1 });
      const results = await Promise.all([signup("last-slot-a@example.test", last.token), signup("last-slot-b@example.test", last.token)]);
      assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
      assert.equal((await sim.prisma.clubInvite.findUniqueOrThrow({ where: { id: last.id } })).usageCount, 1);
      assert.equal(await sim.prisma.member.count({ where: { email: { in: ["last-slot-a@example.test", "last-slot-b@example.test"] } } }), 1);
    });

    await t.test("duplicate email does not consume more invitation quota", async () => {
      const before = (await sim.prisma.clubInvite.findUniqueOrThrow({ where: { id: liveInvite.id } })).usageCount;
      expectStatus(await signup(applicant.email.toUpperCase(), liveInvite.token), 409);
      assert.equal((await sim.prisma.clubInvite.findUniqueOrThrow({ where: { id: liveInvite.id } })).usageCount, before);
    });
  } finally { await sim.close(); }
});
