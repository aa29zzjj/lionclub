import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import { generateKeyPair, SignJWT } from "jose";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

// Real routes, Prisma/PostgreSQL transactions, session signing and production
// verifyProviderToken/jose signature+claim checks. Only the external token
// exchange and the JWKS key source are adapters: no Google/AWS/network requests.
// PGlite and a cookie jar do NOT establish RDS concurrency or browser SameSite /
// real Google consent-screen / provider-console acceptance.
const clientId = "synthetic-google-flow-client";
const clientSecret = "synthetic-google-flow-secret-not-a-production-credential";
const signup = { name: "合成 Google 測試會員", privacyConsent: true, termsConsent: true, oauthConsent: true };
const sessionCookie = "lionclub_session";
const browserCookie = "lionclub_oauth_browser";
const pendingCookie = "lionclub_oauth_pending";
const routePath = (location) => { const url = new URL(location); return url.pathname + url.search; };
const errorCode = (result) => new URL(result.headers.get("Location")).searchParams.get("oauth_error");

test("Google signed-JWT route/SQL flow preserves invitation, consent and identity boundaries", { timeout: 120000 }, async (t) => {
  const sim = await createSimulation({ environment: {
    FEDERATED_AUTH_ENABLED: "true", GOOGLE_OAUTH_CLIENT_ID: clientId, GOOGLE_OAUTH_CLIENT_SECRET: clientSecret,
    GOOGLE_OAUTH_FRESH_REAUTH_ENABLED: "false",
  } });
  try {
    const seed = await seedScenario(sim, "google-signed-flow");
    sim.env.ONBOARDING_ORGANIZATION_ID = seed.ai.id;
    const keys = await generateKeyPair("RS256"), wrongKeys = await generateKeyPair("RS256");
    const protocol = sim.load("src/lib/federated-auth.ts");
    const realVerifyProviderToken = protocol.verifyProviderToken;
    const codes = new Map(), exchanges = [], verifications = [];
    let sequence = 0;

    // Inject ONLY the trusted key source. Production verification still enforces
    // signature, RS256, issuer, audience, nonce, iat/exp, azp and verified email.
    protocol.verifyProviderToken = async (token, config, nonce, options = {}) => {
      verifications.push(token);
      return realVerifyProviderToken(token, config, nonce, { ...options, key: keys.publicKey });
    };
    protocol.exchangeProviderCode = async (config, code, verifier) => {
      const planned = codes.get(code);
      assert.ok(planned, "Only a test-owned one-use code may reach the exchange");
      assert.equal(config.provider, "google"); assert.equal(config.clientId, clientId);
      assert.equal(config.clientSecret, clientSecret);
      assert.equal(config.callback, `${sim.origin}/api/auth/oauth/google/callback`);
      assert.equal(verifier, planned.row.codeVerifier);
      assert.equal(crypto.createHash("sha256").update(verifier).digest("base64url"), planned.authorization.searchParams.get("code_challenge"));
      codes.delete(code); exchanges.push(code);
      return { idToken: planned.token };
    };

    async function startFlow({ jar = sim.jar(), token, purpose = "login", password, oauthConsent, subject, email, claims = {}, signingKey = keys.privateKey } = {}) {
      const index = ++sequence;
      const response = await sim.call("/api/auth/oauth/google/start", "POST", {
        purpose, ...(token ? { token } : {}), ...(password ? { password } : {}), ...(oauthConsent ? { oauthConsent } : {}),
      }, jar);
      assert.equal(response.status, 200, JSON.stringify(response.data));
      const authorization = new URL(response.data.authorizationUrl);
      assert.equal(authorization.origin, "https://accounts.google.com");
      assert.equal(authorization.searchParams.get("response_type"), "code");
      assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
      assert.equal(authorization.searchParams.get("scope"), "openid email profile");
      assert.equal(authorization.searchParams.has("token"), false);
      assert.equal(authorization.searchParams.has("client_secret"), false);
      assert.equal(authorization.searchParams.has("max_age"), false, "do not assume Google supports forced reauth");
      const state = authorization.searchParams.get("state");
      assert.match(state, /^[A-Za-z0-9_-]{43}$/);
      const row = await sim.prisma.oAuthTransaction.findUnique({ where: { stateHash: protocol.hashOAuthSecret(state) } });
      assert.ok(row); assert.notEqual(row.stateHash, state);
      assert.equal(row.nonce, authorization.searchParams.get("nonce"));
      assert.equal(row.browserHash, protocol.hashOAuthSecret(jar.get(browserCookie)));
      assert.notEqual(row.browserHash, jar.get(browserCookie));
      const seconds = Math.floor(Date.now() / 1000);
      const identity = { sub: subject || `signed-google-subject-${index}`, email: email || `signed-google-${index}@example.test` };
      const signed = await new SignJWT({ iss: "https://accounts.google.com", aud: clientId, ...identity,
        email_verified: true, name: "合成 Google 身分", nonce: row.nonce, iat: seconds, exp: seconds + 600, ...claims })
        .setProtectedHeader({ alg: "RS256", kid: "synthetic-local-signing-key" }).sign(signingKey);
      const code = `synthetic-one-use-code-${index}`;
      codes.set(code, { row, authorization, token: signed });
      return { jar, row, state, code, identity, signed, authorization, callback: `/api/auth/oauth/google/callback?state=${state}&code=${code}` };
    }
    async function toPending(flow) {
      const callback = await sim.call(flow.callback, "GET", undefined, flow.jar);
      assert.equal(callback.status, 303); assert.equal(new URL(callback.headers.get("Location")).pathname, "/api/auth/oauth/complete");
      const complete = await sim.call(routePath(callback.headers.get("Location")), "GET", undefined, flow.jar);
      assert.equal(complete.status, 303); assert.equal(new URL(complete.headers.get("Location")).pathname, "/auth/complete");
      const pending = await sim.call("/api/auth/oauth/pending", "GET", undefined, flow.jar);
      assert.equal(pending.status, 200); assert.equal(pending.data.pending, true);
      assert.equal(pending.data.email, flow.identity.email.toLowerCase());
      assert.equal(pending.data.hasInvite, Boolean(flow.row.inviteToken));
      for (const field of ["token", "subject", "state", "nonce", "idToken", "password"]) assert.equal(field in pending.data, false, field);
      return { callback, complete, pending };
    }
    let registered;

    await t.test("start validates origin, binds state/browser and PKCE; foreign browser cannot claim the flow", async () => {
      const before = await sim.prisma.oAuthTransaction.count();
      assert.equal((await sim.call("/api/auth/oauth/google/start", "POST", { purpose: "login" }, sim.jar(), { origin: "https://attacker.example.test" })).status, 403);
      assert.equal((await sim.call("/api/auth/oauth/google/start", "POST", { purpose: "login" }, sim.jar(), { origin: null })).status, 403);
      assert.equal(await sim.prisma.oAuthTransaction.count(), before);
      registered = await startFlow({ token: seed.invite.token, subject: "google-complete-member", email: "google-complete-member@example.test" });
      const attempts = exchanges.length;
      const foreign = await sim.call(registered.callback, "GET", undefined, sim.jar());
      assert.equal(foreign.status, 303); assert.equal(errorCode(foreign), "OAUTH_EXPIRED");
      assert.equal(exchanges.length, attempts);
      assert.equal((await sim.prisma.oAuthTransaction.findUnique({ where: { id: registered.row.id } })).claimedAt, null);
      assert.equal(registered.jar.options.get(browserCookie).httpOnly, true);
      assert.equal(registered.jar.options.get(browserCookie).secure, true);
    });

    await t.test("real signed callback reaches pending without creating any account; invalid consent does not consume invite/state", async () => {
      const before = await sim.prisma.user.count();
      await toPending(registered);
      assert.equal(await sim.prisma.user.count(), before);
      assert.equal(registered.jar.has(sessionCookie), false);
      const usage = (await sim.prisma.clubInvite.findUnique({ where: { id: seed.invite.id } })).usageCount;
      for (const consent of ["privacyConsent", "termsConsent", "oauthConsent"]) {
        for (const value of [undefined, false]) {
          const result = await sim.call("/api/auth/oauth/register", "POST", { ...signup, [consent]: value }, registered.jar);
          assert.equal(result.status, 400, `${consent} ${value === undefined ? "missing" : "false"}`);
        }
      }
      assert.equal(await sim.prisma.user.count(), before);
      assert.equal((await sim.prisma.clubInvite.findUnique({ where: { id: seed.invite.id } })).usageCount, usage);
      assert.equal((await sim.prisma.oAuthTransaction.findUnique({ where: { id: registered.row.id } })).completedAt, null);
    });

    await t.test("valid invite plus three consents creates ACTIVE central member, verified identity and a real HttpOnly session", async () => {
      const result = await sim.call("/api/auth/oauth/register", "POST", { ...signup, email: seed.chair.email, password: "IGNORED-SyntheticPass42!", role: "SUPER_ADMIN" }, registered.jar);
      assert.equal(result.status, 200); assert.equal(result.data.canLogin, true);
      assert.equal(result.data.organizationAssignmentStatus, "NEEDS_ASSIGNMENT");
      const user = await sim.prisma.user.findUnique({ where: { email: registered.identity.email }, include: { member: { include: { adminRoles: true, dataConsents: true } }, federatedIdentities: true } });
      assert.ok(user); registered.user = user;
      assert.equal(user.passwordHash, null); assert.equal(user.member.organizationId, seed.ai.id);
      assert.equal(user.member.status, "ACTIVE"); assert.equal(user.member.organizationAssignmentStatus, "NEEDS_ASSIGNMENT");
      assert.equal(user.member.role, "MEMBER"); assert.deepEqual(user.member.adminRoles, []);
      assert.ok(user.member.emailVerifiedAt); assert.ok(user.member.dataConsents.some((row) => row.purpose === "federated_auth"));
      assert.equal(user.federatedIdentities[0].subject, registered.identity.sub);
      assert.equal(registered.jar.has(pendingCookie), false);
      assert.equal(registered.jar.options.get(sessionCookie).httpOnly, true);
      assert.equal(registered.jar.options.get(sessionCookie).sameSite, "lax");
      assert.equal(registered.jar.options.get(sessionCookie).secure, true);
      const me = await sim.call("/api/me", "GET", undefined, registered.jar);
      assert.equal(me.status, 200); assert.equal(me.data.id, user.member.id); assert.equal(me.data.email, user.email);
      const scrubbed = await sim.prisma.oAuthTransaction.findUnique({ where: { id: registered.row.id } });
      assert.ok(scrubbed.completedAt);
      for (const field of ["email", "subject", "providerName", "inviteToken", "codeVerifier"]) assert.equal(scrubbed[field], null);
      const attempts = exchanges.length;
      assert.equal(errorCode(await sim.call(registered.callback, "GET", undefined, registered.jar)), "OAUTH_EXPIRED");
      assert.equal(exchanges.length, attempts, "callback replay never exchanges the code twice");
    });

    await t.test("subsequent signed Google login uses stable subject, not changed provider email, and creates the same user session", async () => {
      assert.equal((await sim.call("/api/auth/logout", "POST", undefined, registered.jar)).status, 200);
      assert.equal((await sim.call("/api/me", "GET", undefined, registered.jar)).status, 401);
      const before = await sim.prisma.user.count();
      const returning = await startFlow({ subject: registered.identity.sub, email: "provider-changed-email@example.test" });
      const callback = await sim.call(returning.callback, "GET", undefined, returning.jar);
      const complete = await sim.call(routePath(callback.headers.get("Location")), "GET", undefined, returning.jar);
      assert.equal(new URL(complete.headers.get("Location")).pathname, "/home");
      const me = await sim.call("/api/me", "GET", undefined, returning.jar);
      assert.equal(me.status, 200); assert.equal(me.data.id, registered.user.member.id);
      assert.equal(me.data.email, registered.user.email); assert.equal(await sim.prisma.user.count(), before);
      assert.equal(returning.jar.has(pendingCookie), false);
      registered.loggedInJar = returning.jar;
    });

    await t.test("same-email local account is never auto-merged; only explicit password-confirmed consent may link it", async () => {
      const before = await sim.prisma.user.count();
      const existing = await startFlow({ subject: "google-existing-local-user", email: seed.friend.email.toUpperCase() });
      const callback = await sim.call(existing.callback, "GET", undefined, existing.jar);
      const complete = await sim.call(routePath(callback.headers.get("Location")), "GET", undefined, existing.jar);
      assert.equal(errorCode(complete), "ACCOUNT_LINK_REQUIRED");
      assert.equal(existing.jar.has(sessionCookie), false); assert.equal(existing.jar.has(pendingCookie), false);
      assert.equal(await sim.prisma.user.count(), before);
      assert.equal(await sim.prisma.federatedIdentity.count({ where: { subject: existing.identity.sub } }), 0);
      const localJar = sim.jar();
      assert.equal((await sim.call("/api/auth/login", "POST", { email: seed.friend.email, password: seed.password }, localJar)).status, 200);
      assert.equal((await sim.call("/api/auth/oauth/google/start", "POST", { purpose: "link", password: seed.password }, localJar)).status, 400);
      assert.equal((await sim.call("/api/auth/oauth/google/start", "POST", { purpose: "link", password: "incorrect-synthetic-password", oauthConsent: true }, localJar)).status, 401);
      const linking = await startFlow({ jar: localJar, purpose: "link", password: seed.password, oauthConsent: true, subject: existing.identity.sub, email: seed.friend.email });
      const linkedCallback = await sim.call(linking.callback, "GET", undefined, localJar);
      const linked = await sim.call(routePath(linkedCallback.headers.get("Location")), "GET", undefined, localJar);
      assert.equal(new URL(linked.headers.get("Location")).pathname, "/profile");
      assert.equal(new URL(linked.headers.get("Location")).searchParams.get("oauth"), "linked");
      assert.equal((await sim.prisma.federatedIdentity.findUnique({ where: { provider_subject: { provider: "google", subject: existing.identity.sub } } })).userId, seed.friend.user.id);
      assert.equal(await sim.prisma.user.count(), before);
    });

    await t.test("pending identity without invite, or invite revoked after OAuth, cannot register or consume state", async () => {
      const before = await sim.prisma.user.count();
      const noInvite = await startFlow(); await toPending(noInvite);
      assert.equal((await sim.call("/api/auth/oauth/register", "POST", signup, noInvite.jar)).status, 400);
      const lateRevoked = await startFlow({ token: seed.invite.token }); await toPending(lateRevoked);
      await sim.prisma.clubInvite.update({ where: { id: seed.invite.id }, data: { revokedAt: new Date() } });
      try {
        assert.equal((await sim.call("/api/auth/oauth/register", "POST", signup, lateRevoked.jar)).status, 400);
        assert.equal((await sim.prisma.oAuthTransaction.findUnique({ where: { id: lateRevoked.row.id } })).completedAt, null);
      } finally { await sim.prisma.clubInvite.update({ where: { id: seed.invite.id }, data: { revokedAt: null } }); }
      assert.equal(await sim.prisma.user.count(), before);
    });

    await t.test("explicit cancellation scrubs pending state; restoring old cookies cannot replay callback, completion or signup", async () => {
      const flow = await startFlow({ token: seed.invite.token }); await toPending(flow);
      const before = await sim.prisma.user.count(), restored = new Map(flow.jar);
      const denied = await sim.call("/api/auth/oauth/cancel", "POST", {}, flow.jar, { origin: "https://attacker.example.test" });
      assert.equal(denied.status, 403); assert.equal(flow.jar.has(pendingCookie), true);
      assert.equal((await sim.prisma.oAuthTransaction.findUnique({ where: { id: flow.row.id } })).completedAt, null);
      const cancelled = await sim.call("/api/auth/oauth/cancel", "POST", {}, flow.jar);
      assert.equal(cancelled.status, 200); assert.equal(cancelled.data.ok, true);
      assert.equal(flow.jar.has(browserCookie), false); assert.equal(flow.jar.has(pendingCookie), false);
      const state = await sim.prisma.oAuthTransaction.findUnique({ where: { id: flow.row.id } });
      assert.ok(state.completedAt); assert.equal(state.email, null); assert.equal(state.inviteToken, null); assert.equal(state.browserHash, "");
      assert.equal(errorCode(await sim.call(flow.callback, "GET", undefined, restored)), "OAUTH_EXPIRED");
      assert.equal(errorCode(await sim.call(`/api/auth/oauth/complete?state=${flow.state}`, "GET", undefined, restored)), "OAUTH_EXPIRED");
      assert.equal((await sim.call("/api/auth/oauth/register", "POST", signup, restored)).status, 400);
      assert.equal(await sim.prisma.user.count(), before);
    });

    await t.test("provider denial and expired state return safe errors without token exchange or account mutation", async () => {
      const flow = await startFlow({ token: seed.invite.token }), before = await sim.prisma.user.count(), calls = exchanges.length;
      const denied = await sim.call(`/api/auth/oauth/google/callback?state=${flow.state}&error=access_denied`, "GET", undefined, flow.jar);
      assert.equal(errorCode(denied), "OAUTH_CANCELLED"); assert.equal(exchanges.length, calls);
      // Provider denial is not asserted to burn state: /oauth/cancel owns explicit
      // browser cancellation. This only proves no exchange/login/signup occurred.
      await sim.prisma.oAuthTransaction.update({ where: { id: flow.row.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      assert.equal(errorCode(await sim.call(flow.callback, "GET", undefined, flow.jar)), "OAUTH_EXPIRED");
      assert.equal(exchanges.length, calls); assert.equal(await sim.prisma.user.count(), before);
    });

    await t.test("real jose rejects wrong signatures, issuer, audience, nonce, expiry and unverified email in route callbacks", async () => {
      const before = await sim.prisma.user.count();
      for (const invalid of [
        { signingKey: wrongKeys.privateKey }, { claims: { iss: "https://attacker.example.test" } },
        { claims: { aud: "wrong-synthetic-client" } }, { claims: { nonce: "wrong-synthetic-nonce" } },
        { claims: { exp: Math.floor(Date.now() / 1000) - 120 } }, { claims: { email_verified: false } },
      ]) {
        const flow = await startFlow(invalid);
        const callback = await sim.call(flow.callback, "GET", undefined, flow.jar);
        assert.equal(callback.status, 303);
        assert.equal(new URL(callback.headers.get("Location")).pathname, "/login");
        assert.ok(errorCode(callback)); assert.equal(flow.jar.has(sessionCookie), false); assert.equal(flow.jar.has(pendingCookie), false);
        const row = await sim.prisma.oAuthTransaction.findUnique({ where: { id: flow.row.id } });
        assert.ok(row.claimedAt); assert.equal(row.verifiedAt, null);
        assert.ok(!callback.headers.get("Location").includes(flow.signed));
      }
      assert.equal(await sim.prisma.user.count(), before);
      assert.ok(verifications.length >= 10, "route flow must retain real signature/claim verification");
    });

    await t.test("delete purpose and unvalidated Google reauth are blocked without granting any proof", async () => {
      const before = await sim.prisma.oAuthTransaction.count();
      const removed = await sim.call("/api/auth/oauth/google/start", "POST", { purpose: "delete" }, registered.loggedInJar);
      assert.equal(removed.status, 400);
      const gated = await sim.call("/api/auth/oauth/google/start", "POST", { purpose: "reauth" }, registered.loggedInJar);
      assert.equal(gated.status, 503); assert.equal(gated.data.code, "PROVIDER_REAUTH_UNAVAILABLE");
      assert.equal(await sim.prisma.oAuthTransaction.count(), before);
      const methods = await sim.call("/api/me/auth-methods", "GET", undefined, registered.loggedInJar);
      assert.equal(methods.status, 200); assert.equal(methods.data.hasPassword, false);
      assert.equal(methods.data.identities[0].reauthAvailable, false);
      assert.deepEqual(methods.data.reauthActions, []);
    });

    await t.test("disabled Google has no SQL dependency and never exposes server credentials", async () => {
      sim.env.FEDERATED_AUTH_ENABLED = "false";
      // A disabled public/start/pending path must not need SQL. Drop only this
      // test-owned DB's tables so any attempted query would fail rather than
      // silently pass through a populated fixture. Existing local auth is not
      // exercised while its tables are absent.
      await sim.database.exec('DROP TABLE "OAuthTransaction"; DROP TABLE "FederatedIdentity"; DROP TABLE "RateLimitAttempt";');
      const providers = await sim.call("/api/auth/providers");
      assert.equal(providers.status, 200);
      assert.equal(providers.data.providers.find((row) => row.id === "google").enabled, false);
      assert.ok(!JSON.stringify(providers.data).includes(clientSecret));
      const start = await sim.call("/api/auth/oauth/google/start", "POST", { purpose: "login" });
      assert.equal(start.status, 503); assert.equal(start.data.code, "PROVIDER_DISABLED");
      const jar = sim.jar(); jar.set(pendingCookie, protocol.randomOAuthSecret());
      assert.deepEqual((await sim.call("/api/auth/oauth/pending", "GET", undefined, jar)).data, { pending: false });
    });
  } finally { await sim.close(); }
});
