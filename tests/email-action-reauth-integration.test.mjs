import assert from "node:assert/strict";
import { test } from "node:test";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

const environment = { EMAIL_ACTION_REAUTH_ENABLED: "true", FEDERATED_AUTH_ENABLED: "true", APPLE_OAUTH_ENABLED: "true",
  GOOGLE_OAUTH_CLIENT_ID: "synthetic-google", GOOGLE_OAUTH_CLIENT_SECRET: "synthetic-google-secret", GOOGLE_OAUTH_FRESH_REAUTH_ENABLED: "true",
  APPLE_OAUTH_CLIENT_ID: "synthetic.apple.service", APPLE_OAUTH_TEAM_ID: "synthetic-team", APPLE_OAUTH_KEY_ID: "synthetic-key",
  APPLE_OAUTH_PRIVATE_KEY: "synthetic PRIVATE KEY marker, not a key", OAUTH_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString("base64") };
const status = (response, expected = 200) => { assert.equal(response.status, expected, JSON.stringify(response.data)); return response.data; };
async function actor(sim, suffix, { trusted = true, password = false, google = false } = {}) {
  const s = await seedScenario(sim, `email-${suffix}`), person = s.member;
  if (!password) await sim.prisma.user.update({ where: { id: person.user.id }, data: { passwordHash: null } });
  const identity = await sim.prisma.federatedIdentity.create({ data: { userId: person.user.id, provider: "apple", subject: `synthetic-apple-${suffix}`,
    email: `security-${suffix}@example.test`, securityEmailVerifiedAt: trusted ? new Date() : null, refreshTokenCiphertext: "synthetic-encrypted-token" } });
  if (google) await sim.prisma.federatedIdentity.create({ data: { userId: person.user.id, provider: "google", subject: `synthetic-google-${suffix}`, email: person.email } });
  const session = { userId: person.user.id, memberId: person.id, email: person.email, sessionVersion: person.user.sessionVersion };
  const jar = sim.jar(), token = await sim.load("src/lib/auth-session.ts").signSessionToken(session, new TextEncoder().encode(sim.env.AUTH_SECRET));
  jar.set("lionclub_session", token);
  return { ...s, person, identity, session, jar };
}
const domain = sim => sim.load("src/lib/email-action-reauth.ts");
const lastCode = sim => sim.inbox.at(-1).text.match(/驗證碼：(\d{6})/)[1];
async function challenge(sim, a, action = "delete") {
  const result = status(await sim.call("/api/me/email-action/start", "POST", { action }, a.jar));
  return { ...result, code: lastCode(sim) };
}
async function verified(sim, a, action = "delete") {
  const c = await challenge(sim, a, action);
  const result = status(await sim.call("/api/me/email-action/verify", "POST", { challengeId: c.challengeId, action, code: c.code }, a.jar));
  return { ...c, result, proof: a.jar.get("lionclub_email_action") };
}

test("email action step-up is explicit, actor-bound, single-use and delivery-confirmed", { timeout: 120000 }, async t => {
  const sim = await createSimulation({ environment });
  try {
    await t.test("browser Origin/session and strict input prevent caller-selected recipients", async () => {
      const a = await actor(sim, "input");
      status(await sim.call("/api/me/email-action/start", "POST", { action: "delete" }, sim.jar()), 401);
      status(await sim.call("/api/me/email-action/start", "POST", { action: "delete" }, a.jar, { origin: null }), 403);
      status(await sim.call("/api/me/email-action/start", "POST", { action: "delete" }, a.jar, { origin: "https://attacker.invalid" }), 403);
      for (const extra of [{ email: "attacker@example.test" }, { userId: a.friend.user.id }, { identityId: a.identity.id }]) {
        status(await sim.call("/api/me/email-action/start", "POST", { action: "delete", ...extra }, a.jar), 400);
      }
      assert.equal(sim.inbox.length, 0);
      // Ordinary profile editing cannot change the provider-attested recipient.
      await sim.prisma.user.update({ where: { id: a.person.user.id }, data: { email: "changed-profile@example.test" } });
      await sim.prisma.member.update({ where: { id: a.person.id }, data: { email: "changed-profile@example.test", emailVerifiedAt: new Date() } });
      const c = await challenge(sim, a);
      assert.equal(sim.inbox.at(-1).to, a.identity.email);
      assert.equal(JSON.stringify(c).includes(a.identity.email), false);
      const row = await sim.prisma.emailActionChallenge.findUniqueOrThrow({ where: { id: c.challengeId } });
      assert.equal(row.deliveryState, "SENT"); assert.equal(row.codeHash.length, 64); assert.notEqual(row.codeHash, c.code);
    });
    await t.test("legacy, password-bearing or multi-provider identities cannot use Apple-only email step-up", async () => {
      for (const [suffix, options] of [["legacy", { trusted: false }], ["password", { password: true }], ["multi", { google: true }]]) {
        const a = await actor(sim, suffix, options), before = sim.inbox.length;
        status(await sim.call("/api/me/email-action/start", "POST", { action: "delete" }, a.jar), 403);
        assert.equal(status(await sim.call("/api/me/auth-methods", "GET", undefined, a.jar)).emailActionReauth.available, false);
        assert.equal(sim.inbox.length, before);
      }
    });
    await t.test("only successful verification sets a separate HttpOnly proof and never performs an action", async () => {
      const a = await actor(sim, "verify"), c = await challenge(sim, a, "sessions");
      const rejected = await sim.call("/api/me/email-action/verify", "POST", { challengeId: c.challengeId, action: "delete", code: c.code }, a.jar);
      status(rejected, 400); assert.equal(a.jar.has("lionclub_email_action"), false);
      const result = status(await sim.call("/api/me/email-action/verify", "POST", { challengeId: c.challengeId, action: "sessions", code: c.code }, a.jar));
      assert.equal(result.ok, true); assert.equal("proof" in result, false); assert.equal(JSON.stringify(result).includes(c.code), false);
      assert.match(a.jar.get("lionclub_email_action"), /^email1\./); assert.equal(a.jar.has("lionclub_oauth_reauth"), false);
      assert.equal(a.jar.options.get("lionclub_email_action").httpOnly, true); assert.equal(a.jar.options.get("lionclub_email_action").secure, true);
      assert.equal(a.jar.options.get("lionclub_email_action").sameSite, "lax");
      const methods = status(await sim.call("/api/me/auth-methods", "GET", undefined, a.jar));
      assert.deepEqual(methods.reauthActions, ["sessions"]); assert.equal(methods.identities[0].reauthAvailable, false, "email proof is not fresh Apple provider auth");
      assert.equal((await sim.prisma.user.findUniqueOrThrow({ where: { id: a.person.user.id } })).sessionVersion, a.session.sessionVersion);
      status(await sim.call("/api/me/email-action/verify", "POST", { challengeId: c.challengeId, action: "sessions", code: c.code }, a.jar), 400);
    });
    await t.test("wrong-code attempts commit and are bounded, including parallel requests", async () => {
      const a = await actor(sim, "attempts"), c = await challenge(sim, a);
      const wrong = c.code === "000000" ? "111111" : "000000";
      const results = await Promise.allSettled(Array.from({ length: 5 }, () => domain(sim).verifyEmailAction(sim.prisma, a.session,
        { challengeId: c.challengeId, action: "delete", code: wrong }, sim.env.AUTH_SECRET)));
      assert.ok(results.every(item => item.status === "rejected"));
      const row = await sim.prisma.emailActionChallenge.findUniqueOrThrow({ where: { id: c.challengeId } });
      assert.equal(row.attempts, 5); assert.ok(row.invalidatedAt); assert.equal(row.codeHash, null);
      await assert.rejects(domain(sim).verifyEmailAction(sim.prisma, a.session, { challengeId: c.challengeId, action: "delete", code: c.code }, sim.env.AUTH_SECRET));
    });
    await t.test("two correct verifications and two proof consumers have only one winner", async () => {
      const a = await actor(sim, "once"), c = await challenge(sim, a);
      const outcomes = await Promise.allSettled([0, 1].map(() => domain(sim).verifyEmailAction(sim.prisma, a.session,
        { challengeId: c.challengeId, action: "delete", code: c.code }, sim.env.AUTH_SECRET)));
      assert.equal(outcomes.filter(item => item.status === "fulfilled").length, 1);
      const proof = outcomes.find(item => item.status === "fulfilled").value.proof;
      assert.equal(await domain(sim).consumeEmailActionProof(sim.prisma, a.session, proof, "link"), null);
      const consumed = await Promise.all([0, 1].map(() => domain(sim).consumeEmailActionProof(sim.prisma, a.session, proof, "delete")));
      assert.equal(consumed.filter(Boolean).length, 1);
    });
    await t.test("changed actor, session, identity, contact, flag and expiry invalidate existing proof", async () => {
      const mutations = [
        (a) => sim.prisma.user.update({ where: { id: a.person.user.id }, data: { sessionVersion: { increment: 1 } } }),
        (a) => sim.prisma.member.update({ where: { id: a.person.id }, data: { status: "SUSPENDED" } }),
        (a) => sim.prisma.federatedIdentity.update({ where: { id: a.identity.id }, data: { email: "new-security@example.test" } }),
        (a) => sim.prisma.federatedIdentity.update({ where: { id: a.identity.id }, data: { securityEmailVerifiedAt: null } }),
      ];
      for (let index = 0; index < mutations.length; index++) {
        const a = await actor(sim, `changed-${index}`), v = await verified(sim, a);
        await mutations[index](a);
        assert.equal(await domain(sim).consumeEmailActionProof(sim.prisma, a.session, v.proof, "delete"), null);
      }
      const a = await actor(sim, "bound"), b = await actor(sim, "other"), v = await verified(sim, a);
      assert.equal(await domain(sim).consumeEmailActionProof(sim.prisma, b.session, v.proof, "delete"), null);
      sim.env.EMAIL_ACTION_REAUTH_ENABLED = "false";
      assert.equal(await domain(sim).consumeEmailActionProof(sim.prisma, a.session, v.proof, "delete"), null);
      sim.env.EMAIL_ACTION_REAUTH_ENABLED = "true";
      assert.equal(await domain(sim).consumeEmailActionProof(sim.prisma, a.session, v.proof, "delete", true, { now: new Date(Date.now() + 6 * 60_000) }), null);
      const fresh = await challenge(sim, a);
      await assert.rejects(domain(sim).verifyEmailAction(sim.prisma, a.session, { challengeId: fresh.challengeId, action: "delete", code: fresh.code }, sim.env.AUTH_SECRET,
        { now: new Date(Date.now() + 11 * 60_000) }));
    });
    await t.test("pending or failed delivery cannot verify and actor send rate limits commit", async () => {
      const a = await actor(sim, "pending"); let release, mail;
      const wait = new Promise(resolve => { release = resolve; });
      const started = domain(sim).startEmailAction(sim.prisma, a.session, "delete", sim.env.AUTH_SECRET, { sender: async input => { mail = input; await wait; } });
      while (!mail) await new Promise(resolve => setImmediate(resolve));
      const row = await sim.prisma.emailActionChallenge.findFirstOrThrow({ where: { userId: a.session.userId } });
      await assert.rejects(domain(sim).verifyEmailAction(sim.prisma, a.session, { challengeId: row.id, action: "delete", code: mail.text.match(/驗證碼：(\d{6})/)[1] }, sim.env.AUTH_SECRET));
      release(); await started;
      const failure = await actor(sim, "mail-failure"); sim.control.failEmail = true;
      status(await sim.call("/api/me/email-action/start", "POST", { action: "delete" }, failure.jar), 503);
      const failed = await sim.prisma.emailActionChallenge.findFirstOrThrow({ where: { userId: failure.session.userId } });
      assert.equal(failed.deliveryState, "FAILED"); assert.equal(failed.codeHash, null); assert.ok(failed.invalidatedAt); sim.control.failEmail = false;
      const limited = await actor(sim, "limited");
      for (let index = 0; index < 3; index++) await challenge(sim, limited);
      status(await sim.call("/api/me/email-action/start", "POST", { action: "delete" }, limited.jar), 429);
    });
    await t.test("sessions proof and version CAS are atomic and cannot authorize another action", async () => {
      const a = await actor(sim, "sessions"), v = await verified(sim, a, "sessions");
      status(await sim.call("/api/me/account-deletion", "POST", {}, a.jar), 401);
      assert.equal((await sim.prisma.emailActionChallenge.findUniqueOrThrow({ where: { id: v.challengeId } })).proofUsedAt, null);
      const result = status(await sim.call("/api/me/sessions/revoke", "POST", {}, a.jar));
      assert.equal(result.currentSessionRetained, true);
      assert.equal((await sim.prisma.user.findUniqueOrThrow({ where: { id: a.person.user.id } })).sessionVersion, a.session.sessionVersion + 1);
      assert.ok((await sim.prisma.emailActionChallenge.findUniqueOrThrow({ where: { id: v.challengeId } })).proofUsedAt);
    });
    await t.test("web linking binds the consumed source through provider return and refuses changed identities", async () => {
      const service = sim.load("src/lib/federated-auth-service.ts");
      for (const changed of [false, true]) {
        const a = await actor(sim, `link-${changed}`); await verified(sim, a, "link");
        const start = status(await sim.call("/api/auth/oauth/google/start", "POST", { purpose: "link", oauthConsent: true }, a.jar));
        const state = new URL(start.authorizationUrl).searchParams.get("state"), browser = a.jar.get("lionclub_oauth_browser");
        await service.acceptOAuthCallback(sim.prisma, "google", state, browser, { code: "synthetic-code" }, {
          exchange: async () => ({ idToken: "synthetic-token" }), verify: async () => ({ subject: `synthetic-linked-${changed}`, email: a.person.email, payload: {} }),
        });
        if (changed) {
          await sim.prisma.federatedIdentity.update({ where: { id: a.identity.id }, data: { email: "changed-before-link@example.test" } });
          await assert.rejects(service.finishOAuth(sim.prisma, state, browser, a.session));
          assert.equal(await sim.prisma.federatedIdentity.count({ where: { userId: a.session.userId, provider: "google" } }), 0);
        } else {
          assert.equal((await service.finishOAuth(sim.prisma, state, browser, a.session)).kind, "linked");
          assert.equal(await sim.prisma.federatedIdentity.count({ where: { userId: a.session.userId } }), 2);
        }
      }
    });
    await t.test("new verified Apple login establishes a trusted contact; ordinary profile PATCH and legacy rows do not", async () => {
      const a = await actor(sim, "attested", { trusted: false });
      const service = sim.load("src/lib/federated-auth-service.ts"), protocol = sim.load("src/lib/federated-auth.ts"), browser = protocol.randomOAuthSecret();
      const begin = await service.beginOAuth(sim.prisma, "apple", "login", browser, null);
      const state = new URL(begin.authorizationUrl).searchParams.get("state");
      await service.acceptOAuthCallback(sim.prisma, "apple", state, browser, { code: "synthetic-code", idToken: "synthetic-front" }, {
        exchange: async () => ({ idToken: "synthetic-back", refreshToken: "synthetic-refresh" }),
        verify: async () => ({ subject: a.identity.subject, email: "new-attested@example.test", payload: {} }),
      });
      await service.finishOAuth(sim.prisma, state, browser, null);
      const identity = await sim.prisma.federatedIdentity.findUniqueOrThrow({ where: { id: a.identity.id } });
      assert.equal(identity.email, "new-attested@example.test"); assert.ok(identity.securityEmailVerifiedAt);
      status(await sim.call("/api/me", "PATCH", { email: "ordinary-profile@example.test" }, a.jar));
      assert.equal((await sim.prisma.federatedIdentity.findUniqueOrThrow({ where: { id: a.identity.id } })).email, "new-attested@example.test");
    });
    await t.test("delete rechecks consumed proof at final commit after revoke, expiry or a new delete challenge", async () => {
      const service = sim.load("src/lib/federated-auth-service.ts"), original = service.revokeLinkedAppleBeforeDeletion;
      for (const mode of ["valid", "invalidated", "expired", "new-code", "session-revoked-before-io", "identity-changed-during-io"]) {
        const a = await actor(sim, `delete-${mode}`), v = await verified(sim, a); let sends = 0;
        service.revokeLinkedAppleBeforeDeletion = async (prisma, userId, _send, _config, binding) => {
          if (mode === "session-revoked-before-io") await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
          const snapshot = await original(prisma, userId, async () => { sends++;
            if (mode === "identity-changed-during-io") await prisma.federatedIdentity.update({ where: { id: a.identity.id }, data: { email: "new-during-revoke@example.test" } });
          }, async () => ({ provider: "apple" }), binding);
          if (mode === "invalidated") await prisma.emailActionChallenge.update({ where: { id: v.challengeId }, data: { invalidatedAt: new Date(), proofHash: null } });
          if (mode === "expired") await prisma.emailActionChallenge.update({ where: { id: v.challengeId }, data: { verifiedAt: new Date(Date.now() - 6 * 60_000), proofExpiresAt: new Date(Date.now() - 60_000) } });
          if (mode === "new-code") await domain(sim).startEmailAction(prisma, a.session, "delete", sim.env.AUTH_SECRET, { sender: async () => {} });
          return snapshot;
        };
        try {
          const result = await sim.call("/api/me/account-deletion", "POST", {}, a.jar);
          status(result, mode === "valid" ? 200 : 409);
          assert.equal(Boolean(await sim.prisma.user.findUnique({ where: { id: a.session.userId } })), mode !== "valid");
          const member = await sim.prisma.member.findUniqueOrThrow({ where: { id: a.person.id } });
          assert.equal(member.status, mode === "valid" ? "SUSPENDED" : "ACTIVE");
          assert.equal(Boolean(member.deletedAt), mode === "valid");
          assert.equal(member.email, mode === "valid" ? null : a.person.email);
          assert.equal(await sim.prisma.accountDeletionCleanup.count({ where: { memberId: a.person.id } }), mode === "valid" ? 1 : 0);
          assert.equal(sends, mode === "session-revoked-before-io" ? 0 : 1);
        } finally { service.revokeLinkedAppleBeforeDeletion = original; }
      }
    });
  } finally { await sim.close(); }
});

test("email step-up default-off never probes the new table, and cleanup is bounded without a scheduler", { timeout: 120000 }, async () => {
  const sim = await createSimulation();
  try {
    const a = await actor(sim, "off"); await sim.database.exec('DROP TABLE "EmailActionChallenge"');
    status(await sim.call("/api/me/email-action/start", "POST", { action: "delete" }, a.jar), 503);
    status(await sim.call("/api/me/email-action/verify", "POST", { action: "delete", challengeId: "synthetic", code: "000000" }, a.jar), 503);
    assert.equal(await domain(sim).consumeEmailActionProof(sim.prisma, a.session, `email1.${"a".repeat(43)}`, "delete"), null);
    assert.equal(sim.inbox.length, 0);
  } finally { await sim.close(); }
});
