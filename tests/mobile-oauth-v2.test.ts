import assert from "node:assert/strict";
import { beforeEach, afterEach, test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { hashOAuthSecret } from "../src/lib/federated-auth";
import { readMobileToken, readOAuthBootstrapToken, signOAuthBootstrapToken } from "../src/lib/mobile-auth";
import { cancelNativeOAuthCallback, cancelNativeOAuthClaim, consumeNativeOAuthBootstrap, exchangeNativeOAuthHandoff, nativeOAuthStartSchema,
  nativeOAuthExchangeSchema, nativePkceChallenge, readNativeOAuthBody, requireNativeOAuthV2, NATIVE_OAUTH_REDIRECT_URI } from "../src/lib/mobile-oauth";

// Entirely in-memory concurrency/CAS contract tests. No real Prisma connection,
// provider, native bridge, secrets lookup, network or production write occurs.
const key = new TextEncoder().encode("synthetic-native-v2-test-key-only");
const verifier = "v".repeat(43), state = "s".repeat(43), code = "c".repeat(43), providerState = "p".repeat(43), browser = "b".repeat(43);
const now = new Date("2026-11-07T02:00:00Z"), future = new Date(+now + 600_000);
const input = { protocolVersion: 2, redirectUri: NATIVE_OAUTH_REDIRECT_URI, code, state, codeVerifier: verifier } as const;
let priorFlag: string | undefined;
beforeEach(() => { priorFlag = process.env.MOBILE_OAUTH_V2_ENABLED; process.env.MOBILE_OAUTH_V2_ENABLED = "true"; });
afterEach(() => { if (priorFlag === undefined) delete process.env.MOBILE_OAUTH_V2_ENABLED; else process.env.MOBILE_OAUTH_V2_ENABLED = priorFlag; });
function fixture() {
  const row: Record<string, any> = { id: "synthetic-transaction", purpose: "login", provider: "google", stateHash: hashOAuthSecret(providerState), browserHash: hashOAuthSecret(browser),
    nativeRedirectUri: NATIVE_OAUTH_REDIRECT_URI, nativeState: state, nativeCodeChallenge: nativePkceChallenge(verifier), nativeBootstrapUsedAt: new Date(+now - 30_000),
    nativeHandoffHash: hashOAuthSecret(code), nativeHandoffExpiresAt: new Date(+now + 60_000), nativeHandoffUsedAt: null,
    userId: "synthetic-user", sessionVersion: 1, verifiedAt: new Date(+now - 10_000), claimedAt: new Date(+now - 20_000), completedAt: new Date(+now - 1_000), expiresAt: future };
  const user: Record<string, any> = { id: "synthetic-user", memberId: "synthetic-member", email: "synthetic@example.invalid", sessionVersion: 1,
    member: { id: "synthetic-member", memberNo: "SYNTHETIC", status: "ACTIVE", deletedAt: null } };
  const operations: string[] = [];
  let exists = true, forceCasFailure = false;
  const matches = (where: Record<string, any>) => Object.entries(where).every(([name, value]) => {
    const actual = row[name];
    if (value instanceof Date) return +actual === +value;
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("not" in value && actual === value.not) return false;
      if ("gt" in value && !(actual > value.gt)) return false;
      return true;
    }
    return actual === value;
  });
  const tx = {
    oAuthTransaction: {
      async findUnique({ where }: any) { operations.push("read:transaction"); return exists && matches(where) ? structuredClone(row) : null; },
      async updateMany({ where, data }: any) { operations.push("claim:transaction"); if (!exists || forceCasFailure || !matches(where)) return { count: 0 }; Object.assign(row, structuredClone(data)); return { count: 1 }; },
    },
    user: { async findUnique({ where }: any) { operations.push("read:user"); return where.id === user.id ? structuredClone(user) : null; } },
  };
  const db = { ...tx, async $transaction(action: (value: typeof tx) => Promise<unknown>, options: any) {
    assert.equal(options.isolationLevel, "Serializable"); operations.push("transaction"); return action(tx);
  } } as unknown as PrismaClient;
  return { row, user, db, operations, missing() { exists = false; }, failCas() { forceCasFailure = true; } };
}

test("v2 is default-off and fails before consulting a database", async () => {
  for (const value of [undefined, "false", "TRUE", "1"]) {
    if (value === undefined) delete process.env.MOBILE_OAUTH_V2_ENABLED; else process.env.MOBILE_OAUTH_V2_ENABLED = value;
    assert.throws(requireNativeOAuthV2, { code: "PROVIDER_DISABLED" });
    await assert.rejects(exchangeNativeOAuthHandoff({} as PrismaClient, input, key, now), { code: "PROVIDER_DISABLED" });
  }
});
test("start/exchange require v2, exact redirect, S256 and bounded app bindings; no legacy JWT fallback", () => {
  const start = { protocolVersion: 2, redirectUri: NATIVE_OAUTH_REDIRECT_URI, state, codeChallenge: nativePkceChallenge(verifier), codeChallengeMethod: "S256" };
  assert.equal(nativeOAuthStartSchema.safeParse(start).success, true); assert.equal(nativeOAuthExchangeSchema.safeParse(input).success, true);
  for (const change of [{ protocolVersion: 1 }, { state: "short" }, { codeChallengeMethod: "plain" }, { redirectUri: "https://other.invalid" }, { extra: "ignored?" }])
    assert.equal(nativeOAuthStartSchema.safeParse({ ...start, ...change }).success, false);
  for (const change of [{ protocolVersion: 1 }, { code: "header.payload.signature" }, { codeVerifier: "short" }, { codeVerifier: "v".repeat(129) }, { state: "bad" }, { redirectUri: "other://oauth-callback" }, { extra: true }])
    assert.equal(nativeOAuthExchangeSchema.safeParse({ ...input, ...change }).success, false);
});
test("one valid handoff issues tokens only for the current database identity and scrubs the app binding", async () => {
  const h = fixture(); const result = await exchangeNativeOAuthHandoff(h.db, input, key, now);
  const session = await readMobileToken(result.accessToken, "mobile_access", { key, findUser: async () => h.user as any });
  assert.equal(session?.memberId, "synthetic-member"); assert.equal(session?.email, "synthetic@example.invalid");
  assert.ok(await readMobileToken(result.refreshToken, "mobile_refresh", { key, findUser: async () => h.user as any }));
  assert.equal(h.row.nativeState, null); assert.equal(h.row.nativeCodeChallenge, null); assert.equal(+h.row.nativeHandoffUsedAt, +now);
  await assert.rejects(exchangeNativeOAuthHandoff(h.db, input, key, now), { code: "OAUTH_EXPIRED" });
});
test("two exchanges racing on the same code cannot both claim it", async () => {
  const h = fixture(); const results = await Promise.allSettled([exchangeNativeOAuthHandoff(h.db, input, key, now), exchangeNativeOAuthHandoff(h.db, input, key, now)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
});
test("a wrong state, verifier, redirect or unknown code never consumes a valid code", async () => {
  for (const change of [{ state: "z".repeat(43) }, { codeVerifier: "z".repeat(43) }, { redirectUri: "other://oauth-callback" }, { code: "z".repeat(43) }]) {
    const h = fixture(); await assert.rejects(exchangeNativeOAuthHandoff(h.db, { ...input, ...change } as any, key, now), { code: "OAUTH_EXPIRED" });
    assert.equal(h.row.nativeHandoffUsedAt, null); assert.equal(h.operations.includes("claim:transaction"), false);
  }
});
test("expired, unverified, uncompleted, non-login, unbound or already consumed rows cannot issue tokens", async () => {
  for (const change of [{ nativeHandoffExpiresAt: now }, { expiresAt: now }, { verifiedAt: null }, { completedAt: null }, { purpose: "link" },
    { nativeState: null }, { nativeCodeChallenge: null }, { nativeBootstrapUsedAt: null }, { nativeHandoffUsedAt: now }, { userId: null }, { sessionVersion: null }]) {
    const h = fixture(); Object.assign(h.row, change); await assert.rejects(exchangeNativeOAuthHandoff(h.db, input, key, now), { code: "OAUTH_EXPIRED" });
    assert.equal(h.operations.includes("claim:transaction"), false);
  }
  const missing = fixture(); missing.missing(); await assert.rejects(exchangeNativeOAuthHandoff(missing.db, input, key, now));
});
test("deleted/inactive identities and session revocation are rechecked before the atomic claim", async () => {
  for (const change of [{ sessionVersion: 2 }, { member: null }, { member: { status: "PENDING", deletedAt: null } }, { member: { status: "ACTIVE", deletedAt: now } }]) {
    const h = fixture(); Object.assign(h.user, change); await assert.rejects(exchangeNativeOAuthHandoff(h.db, input, key, now), { code: "OAUTH_EXPIRED" });
    assert.equal(h.row.nativeHandoffUsedAt, null);
  }
});
test("production rejects the public demo identity before issuing mobile credentials", async () => {
  const env = process.env as Record<string, string | undefined>, prior = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    const h = fixture(); h.user.email = "demo@lions.tw";
    await assert.rejects(exchangeNativeOAuthHandoff(h.db, input, key, now), { code: "OAUTH_EXPIRED" });
    assert.equal(h.row.nativeHandoffUsedAt, null);
  } finally { if (prior === undefined) delete env.NODE_ENV; else env.NODE_ENV = prior; }
});
test("a lost atomic claim produces no tokens even after a previously valid read", async () => {
  const h = fixture(); h.failCas(); await assert.rejects(exchangeNativeOAuthHandoff(h.db, input, key, now), { code: "OAUTH_EXPIRED" });
});
function bootstrapInput() { return { transactionId: "synthetic-transaction", provider: "google", browserSecret: browser, authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?state=${providerState}` }; }
function forBootstrap() { const h = fixture(); Object.assign(h.row, { nativeBootstrapUsedAt: null, claimedAt: null, completedAt: null }); return h; }
test("bootstrap is browser/provider/transaction-bound and single-use", async () => {
  const h = forBootstrap(); await consumeNativeOAuthBootstrap(h.db, bootstrapInput(), now);
  await assert.rejects(consumeNativeOAuthBootstrap(h.db, bootstrapInput(), now), { code: "OAUTH_EXPIRED" });
  for (const change of [{ transactionId: "wrong" }, { provider: "apple" }, { browserSecret: "z".repeat(43) }, { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?state=${"z".repeat(43)}` }]) {
    const other = forBootstrap(); await assert.rejects(consumeNativeOAuthBootstrap(other.db, { ...bootstrapInput(), ...change }, now), { code: "OAUTH_EXPIRED" });
    assert.equal(other.row.nativeBootstrapUsedAt, null);
  }
});
test("bootstrap JWT rejects the old protocol and handoff tokens cannot masquerade as bootstraps", async () => {
  const token = await signOAuthBootstrapToken(bootstrapInput(), key);
  assert.deepEqual(await readOAuthBootstrapToken(token, key), bootstrapInput());
  for (const payload of [{ ...bootstrapInput(), typ: "oauth_bootstrap" }, { ...bootstrapInput(), protocolVersion: 2, typ: "oauth_handoff" }]) {
    const old = await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("60s").sign(key);
    assert.equal(await readOAuthBootstrapToken(old, key), null);
  }
});
test("provider cancellation redirects only a matching active native transaction, and consumes it", async () => {
  const h = fixture(); Object.assign(h.row, { completedAt: null, claimedAt: null, verifiedAt: null });
  assert.equal(await cancelNativeOAuthCallback(h.db, "google", providerState, browser, now), state);
  assert.equal(h.row.nativeState, null); assert.equal(h.row.browserHash, "");
  assert.equal(await cancelNativeOAuthCallback(h.db, "google", providerState, browser, now), null);
  for (const [provider, suppliedState, suppliedBrowser] of [["apple", providerState, browser], ["google", "z".repeat(43), browser], ["google", providerState, "z".repeat(43)]]) {
    const other = fixture(); Object.assign(other.row, { completedAt: null, claimedAt: null, verifiedAt: null });
    assert.equal(await cancelNativeOAuthCallback(other.db, provider, suppliedState, suppliedBrowser, now), null);
    assert.equal(other.row.nativeState, state);
  }
  const web = fixture(); Object.assign(web.row, { completedAt: null, nativeRedirectUri: null });
  assert.equal(await cancelNativeOAuthCallback(web.db, "google", providerState, browser, now), null);
});
test("a replay cannot cancel an acquired claim; only its exact unverified owner can return an app error", async () => {
  const h = fixture(); Object.assign(h.row, { completedAt: null, verifiedAt: null });
  assert.equal(await cancelNativeOAuthCallback(h.db, "google", providerState, browser, now), null);
  assert.equal(h.row.completedAt, null);
  assert.equal(await cancelNativeOAuthClaim(h.db, h.row as any, new Date(+h.row.claimedAt + 1), hashOAuthSecret(browser), now), null);
  assert.equal(await cancelNativeOAuthClaim(h.db, h.row as any, h.row.claimedAt, hashOAuthSecret("z".repeat(43)), now), null);
  assert.equal(h.row.completedAt, null);
  assert.equal(await cancelNativeOAuthClaim(h.db, h.row as any, new Date(+h.row.claimedAt), hashOAuthSecret(browser), now), state);
  assert.ok(h.row.completedAt); assert.equal(h.row.nativeState, null); assert.equal(h.row.nativeCodeChallenge, null);
  const verified = fixture(); verified.row.completedAt = null;
  assert.equal(await cancelNativeOAuthCallback(verified.db, "google", providerState, browser, now), null);
  assert.equal(await cancelNativeOAuthClaim(verified.db, verified.row as any, verified.row.claimedAt, hashOAuthSecret(browser), now), null);
  assert.equal(verified.row.nativeState, state);
});
test("native request bodies are bounded even without Content-Length", async () => {
  assert.deepEqual(await readNativeOAuthBody(new Request("https://synthetic.invalid", { method: "POST", body: JSON.stringify(input) })), input);
  assert.equal(await readNativeOAuthBody(new Request("https://synthetic.invalid", { method: "POST", body: "bad JSON" })), null);
  await assert.rejects(readNativeOAuthBody(new Request("https://synthetic.invalid", { method: "POST", body: "{}", headers: { "Content-Length": "5000" } })), { status: 413 });
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(4090)); controller.enqueue(new Uint8Array(20)); }, cancel() { cancelled = true; } });
  await assert.rejects(readNativeOAuthBody(new Request("https://synthetic.invalid", { method: "POST", body: stream, duplex: "half" } as RequestInit)), { status: 413 });
  assert.equal(cancelled, true);
});
