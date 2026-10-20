import assert from "node:assert/strict";
import { test } from "node:test";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

// Real Prisma/PGlite transactions and unchanged application services/routes.
// The provider exchange/verification boundary is injected; real RSA verification
// is separately covered by federated-auth.test.ts. No network/real identities.
test("federated identities, central signup and destructive reauthentication are isolated and single-use", { timeout: 120000 }, async t => {
  const sim = await createSimulation({ environment: { FEDERATED_AUTH_ENABLED: "true", GOOGLE_OAUTH_CLIENT_ID: "synthetic-client", GOOGLE_OAUTH_CLIENT_SECRET: "synthetic-secret",
    APPLE_OAUTH_CLIENT_ID: "synthetic.apple.service", APPLE_OAUTH_TEAM_ID: "SYNTHETIC", APPLE_OAUTH_KEY_ID: "SYNTHETIC", APPLE_OAUTH_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nsynthetic-not-a-key\n-----END PRIVATE KEY-----", APPLE_OAUTH_FRESH_REAUTH_ENABLED: "true", OAUTH_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") } });
  try {
    const seed = await seedScenario(sim, "federated"); sim.env.ONBOARDING_ORGANIZATION_ID = seed.ai.id;
    const protocol = sim.load("src/lib/federated-auth.ts"), service = sim.load("src/lib/federated-auth-service.ts");
    const auth = member => ({ userId: member.user.id, memberId: member.id, email: member.email, sessionVersion: member.user.sessionVersion });
    async function challenge({ provider = "google", purpose = "login", session = null, confirmed = false, email = "oauth-new@example.test", subject = "provider-new", invite, fresh = true } = {}) {
      const browser = protocol.randomOAuthSecret();
      const result = await service.beginOAuth(sim.prisma, provider, purpose, browser, session, confirmed, new Date(), invite);
      const state = new URL(result.authorizationUrl).searchParams.get("state");
      const callback = () => service.acceptOAuthCallback(sim.prisma, provider, state, browser, { code: "synthetic-code", idToken: provider === "apple" ? "synthetic-front-token" : undefined }, {
        exchange: async () => ({ idToken: "synthetic-back-token", refreshToken: provider === "apple" ? "synthetic-apple-refresh" : undefined }),
        verify: async () => ({ subject, email, name: "合成OAuth會員", payload: fresh ? { auth_time: Math.floor(Date.now() / 1000) } : {} }),
      });
      return { browser, state, callback, result };
    }
    let created;
    await t.test("browser/state/provider mismatch cannot claim; callback replay has one winner", async () => {
      const flow = await challenge({ invite: seed.invite.token });
      assert.equal(new URL(flow.result.authorizationUrl).searchParams.has("token"), false);
      await assert.rejects(() => service.acceptOAuthCallback(sim.prisma, "google", flow.state, protocol.randomOAuthSecret(), { code: "bad" }));
      await assert.rejects(() => service.acceptOAuthCallback(sim.prisma, "apple", flow.state, flow.browser, { code: "bad" }));
      let row = await sim.prisma.oAuthTransaction.findUnique({ where: { stateHash: protocol.hashOAuthSecret(flow.state) } });
      assert.equal(row.claimedAt, null); assert.equal(row.inviteToken, seed.invite.token);
      await flow.callback(); await assert.rejects(flow.callback);
      const finished = await service.finishOAuth(sim.prisma, flow.state, flow.browser, null); assert.equal(finished.kind, "register");
      row = await sim.prisma.oAuthTransaction.findUnique({ where: { id: row.id } }); assert.equal(row.completedAt, null);
      created = flow;
    });
    await t.test("matching email never logs in or silently links a pre-existing local/imported member", async () => {
      const before = await sim.prisma.user.count();
      const flow = await challenge({ email: seed.member.email, subject: "same-email-other-subject" }); await flow.callback();
      await assert.rejects(() => service.finishOAuth(sim.prisma, flow.state, flow.browser, null), error => error.code === "ACCOUNT_LINK_REQUIRED");
      assert.equal(await sim.prisma.user.count(), before); assert.equal(await sim.prisma.federatedIdentity.count(), 0);
    });
    const jar = sim.jar(); jar.set("lionclub_oauth_browser", created.browser); jar.set("lionclub_oauth_pending", created.state);
    const signup = { name: "合成第三方獅友", privacyConsent: true, termsConsent: true, oauthConsent: true };
    await t.test("OAuth signup still requires privacy, terms, data consent and a current valid invitation", async () => {
      const missing = await sim.call("/api/auth/oauth/register", "POST", { name: signup.name }, jar); assert.equal(missing.status, 400);
      const invalid = await sim.call("/api/auth/oauth/register", "POST", { ...signup, token: "synthetic-invalid-invite" }, jar); assert.equal(invalid.status, 400);
      assert.equal(await sim.prisma.federatedIdentity.count(), 0);
      const row = await sim.prisma.oAuthTransaction.findUnique({ where: { stateHash: protocol.hashOAuthSecret(created.state) } }); assert.equal(row.completedAt, null, "invalid invite rolls back single-use claim");
    });
    let oauthUser;
    await t.test("valid signup uses only verified email, central ACTIVE/NEEDS_ASSIGNMENT, null password and no admin grants", async () => {
      const response = await sim.call("/api/auth/oauth/register", "POST", { ...signup, email: seed.chair.email, password: "NotUsed42!", role: "SUPER_ADMIN" }, jar);
      assert.equal(response.status, 200); assert.equal(response.data.canLogin, true);
      oauthUser = await sim.prisma.user.findUnique({ where: { email: "oauth-new@example.test" }, include: { member: { include: { adminRoles: true, dataConsents: true } } } });
      assert.ok(oauthUser); assert.equal(oauthUser.passwordHash, null); assert.equal(oauthUser.member.organizationId, seed.ai.id);
      assert.equal(oauthUser.member.status, "ACTIVE"); assert.equal(oauthUser.member.organizationAssignmentStatus, "NEEDS_ASSIGNMENT");
      assert.equal(oauthUser.member.role, "MEMBER"); assert.equal(oauthUser.member.adminRoles.length, 0); assert.ok(oauthUser.member.emailVerifiedAt);
      assert.equal(oauthUser.member.dataConsents[0].purpose, "federated_auth");
      assert.equal(await sim.prisma.federatedIdentity.count({ where: { provider: "google", subject: "provider-new", userId: oauthUser.id } }), 1);
      const scrubbed = await sim.prisma.oAuthTransaction.findUnique({ where: { stateHash: protocol.hashOAuthSecret(created.state) } });
      assert.equal(scrubbed.userId, oauthUser.id);
      for (const field of ["email", "subject", "providerName", "refreshTokenCiphertext", "inviteToken", "codeVerifier"]) assert.equal(scrubbed[field], null);
      assert.equal(scrubbed.nonce, ""); assert.equal(scrubbed.browserHash, "");
      assert.ok(jar.has("lionclub_session")); assert.equal(jar.has("lionclub_oauth_pending"), false);
      jar.set("lionclub_oauth_pending", created.state);
      assert.equal((await sim.call("/api/auth/oauth/register", "POST", signup, jar)).status, 400);
    });
    await t.test("provider subject, not changed provider email, determines the existing account", async () => {
      const flow = await challenge({ email: "provider-changed@example.test", subject: "provider-new" }); await flow.callback();
      const result = await service.finishOAuth(sim.prisma, flow.state, flow.browser, null);
      assert.equal(result.kind, "login"); assert.equal(result.session.userId, oauthUser.id); assert.equal(result.session.email, oauthUser.email);
      const row = await sim.prisma.oAuthTransaction.findUnique({ where: { stateHash: protocol.hashOAuthSecret(flow.state) } });
      assert.equal(row.userId, oauthUser.id); assert.equal(row.email, null); assert.equal(row.inviteToken, null);
      await assert.rejects(() => service.finishOAuth(sim.prisma, flow.state, flow.browser, null));
    });
    await t.test("same provider identity cannot be linked elsewhere and linking requires confirmed current identity", async () => {
      await assert.rejects(() => challenge({ purpose: "link", session: auth(seed.friend), confirmed: false }), error => error.code === "REAUTH_REQUIRED");
      const flow = await challenge({ purpose: "link", session: auth(seed.friend), confirmed: true, subject: "provider-new" }); await flow.callback();
      await assert.rejects(() => service.finishOAuth(sim.prisma, flow.state, flow.browser, auth(seed.friend)), error => error.code === "IDENTITY_ALREADY_LINKED");
      const linked = await challenge({ purpose: "link", session: auth(seed.friend), confirmed: true, subject: "provider-friend", email: "different-provider-email@example.test" }); await linked.callback();
      assert.equal((await service.finishOAuth(sim.prisma, linked.state, linked.browser, auth(seed.friend))).kind, "linked");
      assert.ok(await sim.prisma.memberDataConsent.findUnique({ where: { memberId_purpose_version: { memberId: seed.friend.id, purpose: "federated_auth", version: "2026-10-20" } } }));
    });
    await t.test("reauth must use linked subject and fresh signed auth_time, never a merely newly issued token", async () => {
      const session = { userId: oauthUser.id, memberId: oauthUser.member.id, email: oauthUser.email, sessionVersion: oauthUser.sessionVersion };
      const old = await challenge({ purpose: "reauth", session, subject: "provider-new", fresh: false });
      await assert.rejects(old.callback, error => error.code === "PROVIDER_FRESH_AUTH_REQUIRED");
      const wrong = await challenge({ purpose: "reauth", session, subject: "another-subject", email: "unlinked@example.test" }); await wrong.callback();
      await assert.rejects(() => service.finishOAuth(sim.prisma, wrong.state, wrong.browser, session));
      const good = await challenge({ purpose: "delete", session, subject: "provider-new" }); await good.callback();
      const proof = await service.finishOAuth(sim.prisma, good.state, good.browser, session);
      assert.equal(proof.kind, "reauthenticated"); assert.equal(proof.deletion, true);
      assert.equal(await service.consumeOAuthReauth(sim.prisma, session, proof.proof, "link"), false);
      assert.equal(await service.consumeOAuthReauth(sim.prisma, session, proof.proof, "sessions"), false);
      assert.equal(await service.consumeOAuthReauth(sim.prisma, { ...session, userId: seed.member.user.id }, proof.proof, "delete"), false);
      assert.equal(await service.consumeOAuthReauth(sim.prisma, session, proof.proof, "delete"), true);
      assert.equal(await service.consumeOAuthReauth(sim.prisma, session, proof.proof, "delete"), false);
    });
    await t.test("OAuth-only forgot-password never creates a reset token; deletion requires a fresh proof, then removes User and identity", async () => {
      assert.equal((await sim.call("/api/auth/forgot-password", "POST", { email: oauthUser.email })).status, 200);
      assert.equal(await sim.prisma.passwordResetToken.count({ where: { userId: oauthUser.id } }), 0);
      assert.equal((await sim.call("/api/me/account-deletion", "POST", {}, jar)).status, 401);
      const session = { userId: oauthUser.id, memberId: oauthUser.member.id, email: oauthUser.email, sessionVersion: oauthUser.sessionVersion };
      const flow = await challenge({ purpose: "delete", session, subject: "provider-new" }); await flow.callback();
      const result = await service.finishOAuth(sim.prisma, flow.state, flow.browser, session); jar.set("lionclub_oauth_reauth", result.proof);
      const deletion = await sim.call("/api/me/account-deletion", "POST", {}, jar);
      assert.equal(deletion.status, 200); assert.equal(deletion.data.accountDeleted, true);
      assert.equal(await sim.prisma.user.findUnique({ where: { id: oauthUser.id } }), null);
      assert.equal(await sim.prisma.federatedIdentity.count({ where: { userId: oauthUser.id } }), 0);
      assert.equal(await sim.prisma.oAuthTransaction.count({ where: { userId: oauthUser.id } }), 0);
    });
    await t.test("Apple without a validated fresh-auth capability is gated; revocation failure cannot authorize deletion", async () => {
      await sim.prisma.federatedIdentity.create({ data: { userId: seed.member.user.id, provider: "apple", subject: "apple-member", email: seed.member.email, refreshTokenCiphertext: protocol.encryptProviderToken("synthetic-token") } });
      sim.env.APPLE_OAUTH_FRESH_REAUTH_ENABLED = "false";
      await assert.rejects(() => challenge({ provider: "apple", purpose: "login" }), error => error.code === "PROVIDER_DISABLED");
      await assert.rejects(() => challenge({ provider: "apple", purpose: "delete", session: auth(seed.member), subject: "apple-member" }), error => error.code === "PROVIDER_DISABLED");
      sim.env.APPLE_OAUTH_FRESH_REAUTH_ENABLED = "true";
      let called = 0;
      await assert.rejects(() => service.revokeLinkedAppleBeforeDeletion(sim.prisma, seed.member.user.id, async () => { called++; throw Error("synthetic failure"); }), error => error.code === "APPLE_REVOCATION_FAILED");
      assert.equal(called, 1); assert.ok(await sim.prisma.user.findUnique({ where: { id: seed.member.user.id } }));
      const snapshot = await service.revokeLinkedAppleBeforeDeletion(sim.prisma, seed.member.user.id, async () => { called++; }); assert.equal(snapshot.length, 1);
    });
    await t.test("SUSPENDED/deleted accounts cannot log in, link, or obtain fresh proof", async () => {
      const flow = await challenge({ email: seed.friend.email, subject: "provider-friend" }); await flow.callback();
      await sim.prisma.member.update({ where: { id: seed.friend.id }, data: { status: "SUSPENDED" } });
      await assert.rejects(() => service.finishOAuth(sim.prisma, flow.state, flow.browser, null), error => error.code === "ACCOUNT_UNAVAILABLE");
      await assert.rejects(() => challenge({ purpose: "reauth", session: auth(seed.friend), subject: "provider-friend" }), error => error.code === "SESSION_CHANGED");
    });
    await t.test("expired state housekeeping is bounded, supports dry-run and preserves a still-live proof", async () => {
      const base = { provider: "google", purpose: "login", browserHash: "expired-browser", nonce: "expired-nonce", email: "expired@example.test", inviteToken: "expired-invite", expiresAt: new Date(Date.now() - 60_000) };
      for (let index = 0; index < 3; index++) await sim.prisma.oAuthTransaction.create({ data: { ...base, stateHash: `expired-state-${index}` } });
      const liveProof = await sim.prisma.oAuthTransaction.create({ data: { ...base, purpose: "reauth", stateHash: "expired-state-live-proof", completedAt: new Date(), reauthHash: "synthetic-live-proof", reauthExpiresAt: new Date(Date.now() + 60_000) } });
      assert.deepEqual(JSON.parse(JSON.stringify(await service.cleanupExpiredOAuthTransactions(sim.prisma, 2, new Date(), false))), { candidates: 2, deleted: 0, limit: 2 });
      assert.equal(await sim.prisma.oAuthTransaction.count({ where: { stateHash: { startsWith: "expired-state-" } } }), 4);
      assert.deepEqual(JSON.parse(JSON.stringify(await service.cleanupExpiredOAuthTransactions(sim.prisma, 2))), { candidates: 2, deleted: 2, limit: 2 });
      assert.ok(await sim.prisma.oAuthTransaction.findUnique({ where: { id: liveProof.id } }));
      await assert.rejects(() => service.cleanupExpiredOAuthTransactions(sim.prisma, 1001));
    });
    await t.test("missing new OAuth tables leave auth-methods and existing local login functional", async () => {
      const localJar = sim.jar();
      assert.equal((await sim.call("/api/auth/login", "POST", { email: seed.chair.email, password: seed.password }, localJar)).status, 200);
      await sim.database.exec('DROP TABLE "OAuthTransaction"; DROP TABLE "FederatedIdentity";');
      assert.equal((await sim.call("/api/auth/login", "POST", { email: seed.chair.email, password: seed.password }, localJar)).status, 200);
      const legacySignup = await sim.call("/api/auth/register", "POST", { name: "合成本地密碼會員", email: "local-no-oauth-tables@example.test", password: "SyntheticPass42!", token: seed.invite.token, privacyConsent: true, termsConsent: true }, sim.jar());
      assert.equal(legacySignup.status, 200, "existing password registration must not query new OAuth/consent tables");
      const methods = await sim.call("/api/me/auth-methods", "GET", undefined, localJar);
      assert.equal(methods.status, 200); assert.equal(methods.data.available, false); assert.equal(methods.data.hasPassword, true); assert.deepEqual(methods.data.identities, []);
    });
  } finally { await sim.close(); }
});
