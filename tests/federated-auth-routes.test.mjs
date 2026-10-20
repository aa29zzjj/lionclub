import assert from "node:assert/strict";
import { test } from "node:test";
import { createSimulation, seedScenario } from "./helpers/simulation.mjs";

test("third-party routes reject cross-origin, bind browser, retain invite, require consent and never auto-grant", async () => {
  const sim = await createSimulation({ environment: { FEDERATED_AUTH_ENABLED: "true", GOOGLE_OAUTH_CLIENT_ID: "synthetic-client", GOOGLE_OAUTH_CLIENT_SECRET: "synthetic-secret" } });
  try {
    const fixture = await seedScenario(sim);
    const provider = sim.load("src/lib/federated-auth.ts");
    let exchanges = 0;
    provider.exchangeProviderCode = async () => { exchanges++; return { idToken: "synthetic-id-token" }; };
    provider.verifyProviderToken = async () => ({ subject: "synthetic-subject", email: "new-oauth@example.test", name: "合成OAuth會員", payload: {} });
    const jar = sim.jar();
    const beforeUsers = await sim.prisma.user.count();
    assert.equal((await sim.call("/api/auth/oauth/google/start", "POST", { purpose: "login" }, jar, { origin: "https://attacker.example.test" })).status, 403);
    const start = await sim.call("/api/auth/oauth/google/start", "POST", { purpose: "login", token: fixture.invite.token }, jar);
    assert.equal(start.status, 200);
    const authorization = new URL(start.data.authorizationUrl);
    assert.equal(authorization.hostname, "accounts.google.com");
    assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
    assert.equal(authorization.searchParams.has("token"), false);
    const state = authorization.searchParams.get("state");
    const callback = `/api/auth/oauth/google/callback?state=${state}&code=synthetic-code`;
    const foreign = await sim.call(callback, "GET", undefined, sim.jar());
    assert.equal(foreign.status, 303); assert.match(foreign.headers.get("Location"), /oauth_error=OAUTH_EXPIRED/); assert.equal(exchanges, 0);
    const valid = await sim.call(callback, "GET", undefined, jar);
    assert.equal(valid.status, 303); assert.equal(exchanges, 1);
    const completion = await sim.call(new URL(valid.headers.get("Location")).pathname + new URL(valid.headers.get("Location")).search, "GET", undefined, jar);
    assert.equal(completion.status, 303); assert.equal(new URL(completion.headers.get("Location")).pathname, "/auth/complete");
    const pending = await sim.call("/api/auth/oauth/pending", "GET", undefined, jar);
    assert.equal(pending.data.pending, true); assert.equal(pending.data.hasInvite, true);
    assert.equal("token" in pending.data, false); assert.equal("idToken" in pending.data, false);
    assert.equal(await sim.prisma.user.count(), beforeUsers);
    const payload = { name: "合成OAuth會員", privacyConsent: true, termsConsent: true };
    assert.equal((await sim.call("/api/auth/oauth/register", "POST", payload, jar)).status, 400);
    const registered = await sim.call("/api/auth/oauth/register", "POST", { ...payload, oauthConsent: true, adminRoles: ["SUPER_ADMIN"], role: "ADMIN" }, jar);
    assert.equal(registered.status, 200); assert.equal(registered.data.canLogin, true);
    const user = await sim.prisma.user.findUnique({ where: { email: "new-oauth@example.test" }, include: { member: { include: { adminRoles: true } }, federatedIdentities: true } });
    assert.equal(user.passwordHash, null); assert.equal(user.member.role, "MEMBER"); assert.equal(user.member.adminRoles.length, 0);
    assert.equal(user.member.organizationAssignmentStatus, "NEEDS_ASSIGNMENT"); assert.equal(user.federatedIdentities.length, 1);
    assert.equal((await sim.call("/api/auth/oauth/register", "POST", { ...payload, oauthConsent: true }, jar)).status, 400);
    const replay = await sim.call(callback, "GET", undefined, jar);
    assert.match(replay.headers.get("Location"), /oauth_error=OAUTH_EXPIRED/); assert.equal(exchanges, 1);
  } finally { await sim.close(); }
});

test("calendar route is login gated, bounded, read-only and returns no upstream internals", async () => {
  let requests = 0;
  const sim = await createSimulation({ fetcher: async () => { requests++; return new Response(JSON.stringify([{ id: "fixture", title: "合成公開活動", start: "2026-10-20T08:00:00", lecturer: "not-returned" }])); } });
  try {
    const fixture = await seedScenario(sim), jar = sim.jar();
    assert.equal((await sim.call("/api/events/official-calendar")).status, 401); assert.equal(requests, 0);
    assert.equal((await sim.call("/api/auth/login", "POST", { email: fixture.member.email, password: fixture.password }, jar)).status, 200);
    assert.equal((await sim.call("/api/events/official-calendar?from=2026-02-30&to=2027-01-01", "GET", undefined, jar)).status, 400); assert.equal(requests, 0);
    const before = await sim.prisma.event.count();
    const result = await sim.call("/api/events/official-calendar?from=2026-07-01&to=2027-07-01", "GET", undefined, jar);
    assert.equal(result.status, 200); assert.equal(result.data.events.length, 1); assert.equal(result.data.readOnly, true); assert.equal(result.data.cacheSeconds, 600);
    assert.equal("lecturer" in result.data.events[0], false); assert.equal(await sim.prisma.event.count(), before);
    assert.equal(result.headers.get("Cache-Control"), "private, no-store");
  } finally { await sim.close(); }
});
