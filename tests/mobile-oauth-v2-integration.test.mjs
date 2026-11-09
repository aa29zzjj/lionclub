import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import { generateKeyPair, SignJWT } from "jose";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

// Real routes + migrations + Prisma/PostgreSQL SQL on test-owned PGlite only.
// External Google exchange/JWKS and browser cookies are adapters. This is not
// real Google consent, iOS deep-link, browser SameSite or RDS concurrency proof.
const path = value => { const url = new URL(value); return url.pathname + url.search; };
const redirectUri = "com.lionclubsmembership.app://oauth-callback";
const secret = () => crypto.randomBytes(32).toString("base64url");
const challenge = verifier => crypto.createHash("sha256").update(verifier).digest("base64url");
test("native v2 route/SQL flow is app-bound, one-use, default-off and cannot become a web login", { timeout: 120000 }, async t => {
  const sim = await createSimulation({ environment: { FEDERATED_AUTH_ENABLED: "true", GOOGLE_OAUTH_CLIENT_ID: "synthetic-mobile-v2-client",
    GOOGLE_OAUTH_CLIENT_SECRET: "synthetic-mobile-v2-secret", MOBILE_OAUTH_V2_ENABLED: "true" } });
  try {
    const seed = await seedScenario(sim, "native-v2");
    const subject = "synthetic-native-v2-subject";
    await sim.prisma.federatedIdentity.create({ data: { userId: seed.friend.user.id, provider: "google", subject, email: seed.friend.email } });
    const keys = await generateKeyPair("RS256"), protocol = sim.load("src/lib/federated-auth.ts");
    const verify = protocol.verifyProviderToken;
    protocol.verifyProviderToken = (token, config, nonce, options = {}) => verify(token, config, nonce, { ...options, key: keys.publicKey });
    const plans = new Map();
    protocol.exchangeProviderCode = async (_config, code, providerVerifier) => {
      const plan = plans.get(code); assert.ok(plan); assert.equal(providerVerifier, plan.row.codeVerifier);
      const jwt = await new SignJWT({ sub: plan.subject, email: seed.friend.email, email_verified: true, nonce: plan.row.nonce })
        .setProtectedHeader({ alg: "RS256" }).setIssuer("https://accounts.google.com").setAudience(sim.env.GOOGLE_OAUTH_CLIENT_ID)
        .setIssuedAt().setExpirationTime("5m").sign(keys.privateKey);
      return { idToken: jwt };
    };
    async function start() {
      const state = secret(), codeVerifier = secret(), jar = sim.jar();
      const body = { protocolVersion: 2, redirectUri, state, codeChallenge: challenge(codeVerifier), codeChallengeMethod: "S256" };
      const response = await sim.call("/api/mobile/auth/oauth/google/start", "POST", body, jar);
      assert.equal(response.status, 200); assert.equal(response.data.protocolVersion, 2); assert.equal(response.data.state, state);
      assert.equal(response.headers.get("Cache-Control"), "no-store"); assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
      assert.equal(JSON.stringify(response.data).includes(codeVerifier), false);
      const bootstrap = await sim.call(path(response.data.bootstrapUrl), "GET", undefined, jar);
      assert.equal(bootstrap.status, 303); assert.equal(jar.options.get("lionclub_oauth_browser").httpOnly, true);
      assert.equal((await sim.call(path(response.data.bootstrapUrl), "GET", undefined, jar)).status, 401);
      const providerUrl = new URL(bootstrap.headers.get("Location"));
      const row = await sim.prisma.oAuthTransaction.findUnique({ where: { stateHash: protocol.hashOAuthSecret(providerUrl.searchParams.get("state")) } });
      assert.equal(row.nativeState, state); assert.equal(row.nativeCodeChallenge, body.codeChallenge); assert.notEqual(providerUrl.searchParams.get("state"), state);
      assert.notEqual(row.codeVerifier, codeVerifier);
      const providerCode = secret(); plans.set(providerCode, { row, subject });
      const callback = `/api/auth/oauth/google/callback?state=${providerUrl.searchParams.get("state")}&code=${providerCode}`;
      return { state, codeVerifier, jar, row, callback, providerState: providerUrl.searchParams.get("state"), response };
    }
    async function toHandoff(flow, beforeComplete) {
      const callback = await sim.call(flow.callback, "GET", undefined, flow.jar);
      assert.equal(callback.status, 303); assert.equal(new URL(callback.headers.get("Location")).pathname, "/api/mobile/auth/oauth/complete");
      if (beforeComplete) await beforeComplete();
      const complete = await sim.call(path(callback.headers.get("Location")), "GET", undefined, flow.jar);
      assert.equal(complete.status, 303);
      const app = new URL(complete.headers.get("Location"));
      assert.equal(app.protocol, "com.lionclubsmembership.app:"); assert.equal(app.host, "oauth-callback");
      assert.equal(app.searchParams.get("state"), flow.state); assert.equal(app.searchParams.get("protocolVersion"), "2");
      assert.equal(flow.jar.has("lionclub_session"), false);
      return app;
    }
    const exchange = (flow, app, changes = {}) => sim.call("/api/mobile/auth/oauth/exchange", "POST", { protocolVersion: 2, redirectUri,
      state: flow.state, codeVerifier: flow.codeVerifier, code: app.searchParams.get("code"), ...changes }, sim.jar());

    await t.test("complete issues an opaque handoff; wrong app proof cannot consume it; valid proof succeeds only once", async () => {
      const flow = await start(), app = await toHandoff(flow);
      assert.match(app.searchParams.get("code"), /^[A-Za-z0-9_-]{43}$/); assert.equal(app.href.includes(seed.friend.email), false);
      for (const change of [{ state: secret() }, { codeVerifier: secret() }, { redirectUri: "other://callback" }]) assert.ok([400, 401].includes((await exchange(flow, app, change)).status));
      const row = await sim.prisma.oAuthTransaction.findUnique({ where: { id: flow.row.id } });
      assert.equal(row.nativeHandoffUsedAt, null); assert.equal(row.nativeHandoffHash, protocol.hashOAuthSecret(app.searchParams.get("code")));
      const result = await exchange(flow, app); assert.equal(result.status, 200); assert.ok(result.data.accessToken); assert.ok(result.data.refreshToken);
      assert.equal(result.data.memberId, seed.friend.id); assert.equal((await exchange(flow, app)).status, 401);
      const used = await sim.prisma.oAuthTransaction.findUnique({ where: { id: flow.row.id } });
      assert.ok(used.nativeHandoffUsedAt); assert.equal(used.nativeState, null); assert.equal(used.nativeCodeChallenge, null);
    });
    await t.test("web completion cannot issue a cookie for a native transaction; native completion still works", async () => {
      const flow = await start();
      const app = await toHandoff(flow, async () => {
        const wrong = await sim.call(`/api/auth/oauth/complete?state=${flow.providerState}`, "GET", undefined, flow.jar);
        assert.equal(new URL(wrong.headers.get("Location")).pathname, "/login"); assert.equal(flow.jar.has("lionclub_session"), false);
      });
      assert.equal((await exchange(flow, app)).status, 200);
    });
    await t.test("foreign browser cannot claim or cancel a flow; real provider cancellation returns only its matching app state", async () => {
      const flow = await start();
      const foreign = await sim.call(flow.callback, "GET", undefined, sim.jar());
      assert.equal(new URL(foreign.headers.get("Location")).pathname, "/login");
      assert.equal((await sim.prisma.oAuthTransaction.findUnique({ where: { id: flow.row.id } })).claimedAt, null);
      const cancel = await sim.call(`/api/auth/oauth/google/callback?state=${flow.providerState}&error=access_denied`, "GET", undefined, flow.jar);
      const app = new URL(cancel.headers.get("Location")); assert.equal(app.host, "oauth-callback"); assert.equal(app.searchParams.get("state"), flow.state);
      assert.equal(app.searchParams.get("error"), "OAUTH_CANCELLED"); assert.equal(app.searchParams.has("code"), false);
      const row = await sim.prisma.oAuthTransaction.findUnique({ where: { id: flow.row.id } }); assert.ok(row.completedAt); assert.equal(row.nativeState, null);
    });
    await t.test("a duplicate callback cannot cancel the winner while its provider exchange is suspended", async () => {
      const flow = await start(), original = protocol.exchangeProviderCode;
      let entered, release;
      const reachedProvider = new Promise(resolve => { entered = resolve; });
      const continueProvider = new Promise(resolve => { release = resolve; });
      protocol.exchangeProviderCode = async (...args) => { entered(); await continueProvider; return original(...args); };
      let first;
      try {
        first = sim.call(flow.callback, "GET", undefined, flow.jar);
        await reachedProvider;
        const replay = await sim.call(flow.callback, "GET", undefined, flow.jar);
        assert.equal(new URL(replay.headers.get("Location")).pathname, "/login");
        const pending = await sim.prisma.oAuthTransaction.findUnique({ where: { id: flow.row.id } });
        assert.ok(pending.claimedAt); assert.equal(pending.verifiedAt, null); assert.equal(pending.completedAt, null);
        assert.equal(pending.nativeState, flow.state);
        release();
        const callback = await first;
        assert.equal(new URL(callback.headers.get("Location")).pathname, "/api/mobile/auth/oauth/complete");
        const complete = await sim.call(path(callback.headers.get("Location")), "GET", undefined, flow.jar);
        const app = new URL(complete.headers.get("Location"));
        assert.equal(app.searchParams.get("state"), flow.state); assert.ok(app.searchParams.get("code"));
        assert.equal((await exchange(flow, app)).status, 200);
      } finally { release(); if (first) await first; protocol.exchangeProviderCode = original; }
    });
    await t.test("only the provider claim owner can scrub its own failure and return trusted app state", async () => {
      const flow = await start(), original = protocol.exchangeProviderCode;
      protocol.exchangeProviderCode = async () => { throw Error("synthetic provider exchange failure"); };
      try {
        const failed = await sim.call(flow.callback, "GET", undefined, flow.jar);
        const app = new URL(failed.headers.get("Location"));
        assert.equal(app.host, "oauth-callback"); assert.equal(app.searchParams.get("state"), flow.state);
        assert.equal(app.searchParams.get("error"), "OAUTH_FAILED"); assert.equal(app.searchParams.get("protocolVersion"), "2");
        assert.equal(app.searchParams.has("code"), false);
        const row = await sim.prisma.oAuthTransaction.findUnique({ where: { id: flow.row.id } });
        assert.ok(row.claimedAt); assert.ok(row.completedAt); assert.equal(row.nativeState, null); assert.equal(row.browserHash, "");
        assert.equal(row.codeVerifier, null); assert.equal(row.subject, null);
        const replay = await sim.call(flow.callback, "GET", undefined, flow.jar);
        assert.equal(new URL(replay.headers.get("Location")).pathname, "/login");
      } finally { protocol.exchangeProviderCode = original; }
    });
    await t.test("identity/session revocation and expiry are checked again at exchange", async () => {
      const flow = await start(), app = await toHandoff(flow);
      await sim.prisma.user.update({ where: { id: seed.friend.user.id }, data: { sessionVersion: { increment: 1 } } });
      assert.equal((await exchange(flow, app)).status, 401);
      const expired = await start(), expiredApp = await toHandoff(expired);
      await sim.prisma.oAuthTransaction.update({ where: { id: expired.row.id }, data: { nativeHandoffExpiresAt: new Date(Date.now() - 1000) } });
      assert.equal((await exchange(expired, expiredApp)).status, 401);
    });
    await t.test("concurrent requests yield one successful exchange on this isolated SQL store", async () => {
      const flow = await start(), app = await toHandoff(flow);
      const results = await Promise.all([exchange(flow, app), exchange(flow, app)]);
      assert.equal(results.filter(result => result.status === 200).length, 1);
      assert.ok(results.some(result => [401, 409].includes(result.status)));
    });
    await t.test("legacy request bodies fail closed and turning the deployment flag off stops all native routes", async () => {
      assert.equal((await sim.call("/api/mobile/auth/oauth/google/start", "POST", { redirectUri })).status, 400);
      assert.equal((await sim.call("/api/mobile/auth/oauth/exchange", "POST", { code: "old.jwt.handoff" })).status, 400);
      const before = await sim.prisma.oAuthTransaction.count(); sim.env.MOBILE_OAUTH_V2_ENABLED = "false";
      for (const [url, method, body] of [["/api/mobile/auth/oauth/google/start", "POST", {}], ["/api/mobile/auth/oauth/exchange", "POST", {}], ["/api/mobile/auth/oauth/bootstrap?token=synthetic", "GET"], ["/api/mobile/auth/oauth/complete?state=synthetic", "GET"]]) {
        const response = await sim.call(url, method, body); assert.equal(response.status, 503); assert.equal(response.headers.get("Cache-Control"), "no-store");
      }
      assert.equal(await sim.prisma.oAuthTransaction.count(), before);
    });
    assert.equal(sim.inbox.length, 0);
  } finally { await sim.close(); }
});
