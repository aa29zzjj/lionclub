import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import type { PrismaClient } from "@prisma/client";
import { readSessionToken, signSessionToken, productionLoginDenial } from "../src/lib/auth-session";
import { consumeRateLimit, consumeAuthLimits, rateLimitResponse, type RateLimitDatabase } from "../src/lib/rate-limit";
import { sendVerificationEmail, consumeEmailVerification, verificationHash } from "../src/lib/email-verification";
import { updateOwnProfile } from "../src/lib/member-profile";
import { completePasswordReset, sendPasswordResetEmail } from "../src/lib/password-reset";
import { revokeOtherSessions, SessionRevocationError } from "../src/lib/session-revocation";
import { getAuthAppOrigin } from "../src/lib/auth-origin";
import { NextRequest } from "next/server";
import { POST as loginRoute } from "../src/app/api/auth/login/route";
import { POST as logoutRoute } from "../src/app/api/auth/logout/route";

const now = new Date("2026-10-14T06:00:00.000Z");
const key = new TextEncoder().encode("synthetic-session-key-for-local-tests-only");
const payload = { userId: "u1", memberId: "m1", email: "a@example.test", sessionVersion: 1 };
const clone = <T>(value: T): T => structuredClone(value);

// Serializable fake with rollback; no generated Prisma client instance or network.
function database() {
  const state = {
    user: { id: "u1", memberId: "m1", email: "a@example.test", sessionVersion: 1, passwordHash: "old-hash" },
    member: { id: "m1", name: "合成會員", email: "a@example.test", nickname: null as string | null, status: "ACTIVE", emailVerifiedAt: now as Date | null },
    otherUsers: [] as Array<{ id: string; email: string }>,
    otherMembers: [] as Array<{ id: string; email: string }>,
    tokens: [] as Array<{ id: string; userId: string; email: string; tokenHash: string; expiresAt: Date; usedAt: Date | null }>,
    resets: [] as Array<{ id: string; userId: string; email: string; tokenHash: string; expiresAt: Date; usedAt: Date | null }>,
  };
  type Query = { where?: Record<string, unknown>; data?: Record<string, unknown>; include?: unknown };
  const matches = (record: Record<string, unknown>, where: Record<string, unknown> = {}): boolean => Object.entries(where).every(([field, value]) => {
    const actual = record[field];
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const query = value as { gt?: Date; equals?: string; not?: unknown };
      if (query.gt) return actual instanceof Date && actual > query.gt;
      if (query.equals !== undefined) return String(actual).toLowerCase() === query.equals.toLowerCase();
      if ("not" in query) return actual !== query.not;
    }
    return actual === value;
  });
  const apply = (record: Record<string, unknown>, data: Record<string, unknown> = {}) => {
    for (const [field, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (value && typeof value === "object" && "increment" in value) record[field] = Number(record[field]) + Number((value as { increment: number }).increment);
      else record[field] = clone(value);
    }
  };
  const api = {
    user: {
      findUnique: async (query: Query) => matches(state.user, query.where) ? { ...clone(state.user), ...(query.include ? { member: clone(state.member) } : {}) } : null,
      findFirst: async (query: Query) => clone([state.user, ...state.otherUsers].find(record => matches(record, query.where)) ?? null),
      update: async (query: Query) => { assert.ok(matches(state.user, query.where)); apply(state.user, query.data); return clone(state.user); },
      updateMany: async (query: Query) => { if (!matches(state.user, query.where)) return { count: 0 }; apply(state.user, query.data); return { count: 1 }; },
    },
    member: {
      findFirst: async (query: Query) => clone([state.member, ...state.otherMembers].find(record => matches(record, query.where)) ?? null),
      update: async (query: Query) => { assert.ok(matches(state.member, query.where)); apply(state.member, query.data); return clone(state.member); },
      updateMany: async (query: Query) => { if (!matches(state.member, query.where)) return { count: 0 }; apply(state.member, query.data); return { count: 1 }; },
    },
    emailVerificationToken: {
      create: async (query: Query) => { const token = { id: `e${state.tokens.length}`, usedAt: null, ...query.data } as typeof state.tokens[number]; state.tokens.push(token); return clone(token); },
      findUnique: async (query: Query) => clone(state.tokens.find(record => matches(record, query.where)) ?? null),
      deleteMany: async (query: Query) => { const before = state.tokens.length; state.tokens = state.tokens.filter(record => !matches(record, query.where)); return { count: before - state.tokens.length }; },
      updateMany: async (query: Query) => { const records = state.tokens.filter(record => matches(record, query.where)); records.forEach(record => apply(record, query.data)); return { count: records.length }; },
    },
    passwordResetToken: {
      create: async (query: Query) => { const token = { id: `r${state.resets.length}`, usedAt: null, ...query.data } as typeof state.resets[number]; state.resets.push(token); return clone(token); },
      findUnique: async (query: Query) => clone(state.resets.find(record => matches(record, query.where)) ?? null),
      updateMany: async (query: Query) => { const records = state.resets.filter(record => matches(record, query.where)); records.forEach(record => apply(record, query.data)); return { count: records.length }; },
      deleteMany: async (query: Query) => { const before = state.resets.length; state.resets = state.resets.filter(record => !matches(record, query.where)); return { count: before - state.resets.length }; },
    },
  };
  let previous = Promise.resolve();
  const transaction = async <T>(run: (tx: typeof api) => Promise<T>) => {
    const pending = previous; let release!: () => void;
    previous = new Promise<void>(resolve => { release = resolve; });
    await pending;
    const snapshot = clone(state);
    try { return await run(api); } catch (error) { Object.assign(state, snapshot); throw error; } finally { release(); }
  };
  return { state, db: { ...api, $transaction: transaction } as unknown as PrismaClient };
}

function rateDatabase() {
  const rows = new Map<string, { count: number }>();
  const db: RateLimitDatabase = { rateLimitAttempt: { upsert: async ({ where, create, update }) => {
    const row = rows.get(where.key);
    const next = { count: row ? row.count + update.count.increment : create.count };
    rows.set(where.key, next);
    return clone(next);
  } } };
  return { db, rows };
}

test("F10 first-hit concurrency uses per-window atomic increments with no lost counts", async () => {
  const { db, rows } = rateDatabase();
  const hits = await Promise.all(Array.from({ length: 100 }, () => consumeRateLimit(db, "same-network", 10, 600_000, now)));
  assert.deepEqual(hits.map(hit => hit.count).sort((a, b) => a - b), Array.from({ length: 100 }, (_, i) => i + 1));
  assert.equal(hits.filter(hit => hit.limited).length, 90);
  assert.equal((await consumeRateLimit(db, "same-network", 10, 600_000, new Date(now.getTime() + 600_000))).count, 1);
  assert.equal(rows.size, 2);
});

test("F02 a shared banquet IP permits 200 distinct registrations but email and invite remain bounded", async () => {
  const { db, rows } = rateDatabase();
  const hits = await Promise.all(Array.from({ length: 200 }, (_, index) => consumeAuthLimits(db, "register", "shared-ip", `guest-${index}@example.test`, "synthetic-shared-invite", now)));
  assert.ok(hits.every(hit => hit === null));
  for (let count = 0; count < 5; count++) assert.equal(await consumeAuthLimits(db, "register", "other-ip", "repeat@example.test", "other-invite", now), null);
  const blocked = await consumeAuthLimits(db, "register", "other-ip", "repeat@example.test", "other-invite", now);
  assert.ok(blocked?.limited);
  const response = rateLimitResponse(blocked!);
  assert.equal(response.status, 429); assert.equal(response.headers.get("Retry-After"), "600");
  assert.equal((await response.json()).code, "RATE_LIMITED");
  assert.ok([...rows.keys()].every(name => !name.includes("example.test") && !name.includes("shared-ip") && !name.includes("synthetic-shared-invite")));
  const inviteDb = rateDatabase().db;
  for (let index = 0; index < 2000; index++) assert.equal(await consumeAuthLimits(inviteDb, "register", `ip-${index}`, `guest-${index}@example.test`, "one-invite", now), null);
  assert.ok((await consumeAuthLimits(inviteDb, "register", "new-ip", "extra@example.test", "one-invite", now))?.limited);
});

test("F04 saving nickname with the unchanged or case-normalized email preserves verification", async () => {
  const { db, state } = database();
  const verifiedAt = state.member.emailVerifiedAt;
  const result = await updateOwnProfile(db, payload, { nickname: "合成暱稱", email: " A@EXAMPLE.TEST " });
  assert.equal(result.emailChanged, false); assert.equal(result.member.nickname, "合成暱稱");
  assert.deepEqual(state.member.emailVerifiedAt, verifiedAt); assert.equal(state.tokens.length, 0);
});

test("profile email change cannot create a legacy-case alias of another User or imported Member", async () => {
  const { db, state } = database();
  state.otherUsers.push({ id: "legacy-user", email: "Legacy@Example.test" });
  await assert.rejects(updateOwnProfile(db, payload, { email: "legacy@example.test" }), /PROFILE_EMAIL_CONFLICT/);
  assert.equal(state.user.email, "a@example.test"); assert.equal(state.member.email, "a@example.test");
  state.otherMembers.push({ id: "imported-member", email: "Imported@Example.test" });
  await assert.rejects(updateOwnProfile(db, payload, { email: "IMPORTED@example.test" }), /PROFILE_EMAIL_CONFLICT/);
  assert.equal(state.user.email, "a@example.test"); assert.deepEqual(state.member.emailVerifiedAt, now);
});

test("production credential links require a configured HTTPS origin and ignore hostile request hosts", () => {
  assert.throws(() => getAuthAppOrigin("https://attacker.example.test", { configuredOrigin: "", production: true }), /UNCONFIGURED/);
  assert.throws(() => getAuthAppOrigin("https://attacker.example.test", { configuredOrigin: "http://app.example.test", production: true }), /INVALID/);
  assert.throws(() => getAuthAppOrigin("https://attacker.example.test", { configuredOrigin: "https://user:pass@app.example.test", production: true }), /INVALID/);
  assert.equal(getAuthAppOrigin("https://attacker.example.test", { configuredOrigin: "https://app.example.test/path", production: true }), "https://app.example.test");
  assert.equal(getAuthAppOrigin("http://localhost:3100", { configuredOrigin: "", production: false }), "http://localhost:3100");
});

test("login and logout reject cross-site or missing Origin before any DB or cookie access", async () => {
  for (const handler of [loginRoute, logoutRoute]) {
    for (const origin of [undefined, "https://attacker.example.test"]) {
      const request = new NextRequest("https://app.example.test/api/auth/login", { method: "POST", ...(origin ? { headers: { Origin: origin } } : {}), body: JSON.stringify({ email: "a@example.test", password: "synthetic-password" }) });
      assert.equal((await handler(request)).status, 403);
    }
  }
});

test("F03 address change invalidates old tokens and resend uses DB email, never JWT hints", async () => {
  const { db, state } = database(); const inbox: Array<{ to: string; text: string }> = [];
  state.member.emailVerifiedAt = null;
  await sendVerificationEmail(db, { userId: "u1", email: "stale@example.test", appOrigin: "https://app.example.test" }, { from: "no-reply@example.test", now, token: "synthetic-old-token-with-32-characters", sender: async message => { inbox.push(message); } });
  assert.equal(inbox[0].to, "a@example.test");
  const oldToken = state.tokens[0].tokenHash;
  const changed = await updateOwnProfile(db, payload, { email: "b@example.test" });
  assert.equal(changed.emailChanged, true); assert.equal(state.member.emailVerifiedAt, null); assert.equal(state.tokens.some(record => record.tokenHash === oldToken), false);
  await sendVerificationEmail(db, { userId: "u1", email: payload.email, appOrigin: "https://app.example.test" }, { from: "no-reply@example.test", now, token: "synthetic-new-token-with-32-characters", sender: async message => { inbox.push(message); } });
  assert.equal(inbox[1].to, "b@example.test"); assert.equal(state.tokens[0].email, "b@example.test");
  await assert.rejects(consumeEmailVerification(db, "synthetic-old-token-with-32-characters", now));
  assert.equal(state.member.emailVerifiedAt, null);
  await consumeEmailVerification(db, "synthetic-new-token-with-32-characters", now);
  assert.deepEqual(state.member.emailVerifiedAt, now);
});

test("verification rejects old-address binding and concurrent replay has exactly one winner", async () => {
  const { db, state } = database(); const token = "synthetic-email-token-with-32-characters";
  state.member.emailVerifiedAt = null;
  state.tokens.push({ id: "e1", userId: "u1", email: "old@example.test", tokenHash: verificationHash(token), usedAt: null, expiresAt: new Date(now.getTime() + 60_000) });
  await assert.rejects(consumeEmailVerification(db, token, now)); assert.equal(state.tokens[0].usedAt, null);
  state.tokens[0].email = state.user.email;
  const results = await Promise.allSettled([consumeEmailVerification(db, token, now), consumeEmailVerification(db, token, now)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
});

test("sender failure invalidates the unsent token without sending mail outside the fake inbox", async () => {
  const { db, state } = database(); state.member.emailVerifiedAt = null;
  await assert.rejects(sendVerificationEmail(db, { userId: "u1", appOrigin: "https://app.example.test" }, { from: "no-reply@example.test", now, token: "synthetic-unsent-token", sender: async () => { throw new Error("FAKE_SENDER_FAILURE"); } }));
  assert.equal(state.tokens.length, 0);
});

test("session version checks revoke two devices and legacy version-zero JWTs after migration", async () => {
  const { state } = database();
  const options = { key, production: true, findUser: async () => ({ ...clone(state.user), member: { memberNo: "TEST-001" } }) };
  const tokens = await Promise.all([signSessionToken(payload, key), signSessionToken(payload, key)]);
  assert.ok((await readSessionToken(tokens[0], options))?.userId);
  state.user.email = "b@example.test";
  assert.equal((await readSessionToken(tokens[1], options))?.email, "b@example.test");
  state.user.sessionVersion++;
  assert.equal(await readSessionToken(tokens[0], options), null); assert.equal(await readSessionToken(tokens[1], options), null);
  const fresh = await signSessionToken({ ...payload, sessionVersion: 2 }, key);
  assert.ok(await readSessionToken(fresh, options));
  const legacy = await new SignJWT({ userId: payload.userId, memberId: payload.memberId, email: payload.email }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(key);
  assert.equal(await readSessionToken(legacy, options), null);
});

test("password reset atomically increments session version and is single-use", async () => {
  const { db, state } = database(); const token = "synthetic-reset-token-with-32-characters";
  state.resets.push({ id: "r1", userId: "u1", email: "a@example.test", tokenHash: verificationHash(token), usedAt: null, expiresAt: new Date(now.getTime() + 60_000) });
  const old = await signSessionToken(payload, key);
  await completePasswordReset(db, token, "new-hash", now);
  assert.equal(state.user.passwordHash, "new-hash"); assert.equal(state.user.sessionVersion, 2);
  assert.equal(await readSessionToken(old, { key, production: true, findUser: async () => clone(state.user) }), null);
  await assert.rejects(completePasswordReset(db, token, "replayed-hash", now));
  assert.equal(state.user.passwordHash, "new-hash"); assert.equal(state.user.sessionVersion, 2);
});

test("password reset issuance is address-bound, change revokes links, and stale-address links cannot reset", async () => {
  const { db, state } = database(); const inbox: Array<{ to: string; text: string }> = [];
  const options = { from: "no-reply@example.test", now, token: "synthetic-password-reset-token-32-characters", production: true, sender: async (message: { to: string; text: string }) => { inbox.push(message); } };
  await sendPasswordResetEmail(db, { userId: "u1", requestedEmail: "A@EXAMPLE.TEST", appOrigin: "https://app.example.test" }, options);
  assert.equal(inbox[0].to, "a@example.test"); assert.equal(state.resets[0].email, "a@example.test");
  await updateOwnProfile(db, payload, { email: "b@example.test" });
  assert.equal(state.resets.length, 0);
  assert.equal((await sendPasswordResetEmail(db, { userId: "u1", requestedEmail: "a@example.test", appOrigin: "https://app.example.test" }, options)).sent, false);
  assert.equal(inbox.length, 1); assert.equal(state.resets.length, 0);
  state.resets.push({ id: "old", userId: "u1", email: "a@example.test", tokenHash: verificationHash(options.token), expiresAt: new Date(now.getTime() + 60_000), usedAt: null });
  await assert.rejects(completePasswordReset(db, options.token, "attacker-hash", now));
  assert.equal(state.user.passwordHash, "old-hash"); assert.equal(state.resets[0].usedAt, null);
  state.resets = [];
  await assert.rejects(sendPasswordResetEmail(db, { userId: "u1", requestedEmail: "b@example.test", appOrigin: "https://app.example.test" }, { ...options, sender: async () => { throw new Error("FAKE_SENDER_FAILURE"); } }));
  assert.equal(state.resets.length, 0);
});

test("concurrent password reset use has one winner and expired links do not consume a version", async () => {
  const { db, state } = database(); const token = "synthetic-reset-replay-token-32-characters";
  state.resets.push({ id: "reset", userId: "u1", email: state.user.email, tokenHash: verificationHash(token), expiresAt: now, usedAt: null });
  await assert.rejects(completePasswordReset(db, token, "expired-hash", now));
  assert.equal(state.user.sessionVersion, 1); assert.equal(state.resets[0].usedAt, null);
  state.resets[0].expiresAt = new Date(now.getTime() + 60_000);
  const results = await Promise.allSettled([completePasswordReset(db, token, "winner-a", now), completePasswordReset(db, token, "winner-b", now)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(state.user.sessionVersion, 2);
});

test("revoke other sessions requires the current password, CAS guards races, and only this device is retained", async () => {
  const { db, state } = database(); const otherDevice = await signSessionToken(payload, key);
  let currentToken = ""; let clears = 0;
  const dependencies = {
    verifyPassword: async (password: string, hash: string) => password === "synthetic-password" && hash === "old-hash",
    renewSession: async (session: typeof payload) => { currentToken = await signSessionToken(session, key); },
    clearSession: async () => { clears++; },
  };
  await assert.rejects(revokeOtherSessions(db, payload, "wrong", dependencies), (error: unknown) => error instanceof SessionRevocationError && error.code === "PASSWORD_INVALID");
  assert.equal(state.user.sessionVersion, 1);
  const results = await Promise.allSettled([revokeOtherSessions(db, payload, "synthetic-password", dependencies), revokeOtherSessions(db, payload, "synthetic-password", dependencies)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  assert.equal(state.user.sessionVersion, 2); assert.equal(clears, 0);
  const options = { key, production: true, findUser: async () => clone(state.user) };
  assert.equal(await readSessionToken(otherDevice, options), null); assert.ok(await readSessionToken(currentToken, options));
});

test("revoke remains effective when cookie renewal fails and explicitly reports current-device signout", async () => {
  const { db, state } = database(); let cleared = false;
  const result = await revokeOtherSessions(db, payload, "synthetic-password", {
    verifyPassword: async () => true,
    renewSession: async () => { throw new Error("SYNTHETIC_COOKIE_FAILURE"); },
    clearSession: async () => { cleared = true; },
  });
  assert.deepEqual(result, { currentSessionRetained: false }); assert.equal(cleared, true); assert.equal(state.user.sessionVersion, 2);
});

test("production denies public demo identity and short passwords while local mode remains usable", async () => {
  assert.equal(productionLoginDenial("demo@lions.tw", "demo1234", undefined, true)?.status, 401);
  assert.equal(productionLoginDenial("renamed@example.test", "strong-password", { email: "renamed@example.test", member: { memberNo: "DEMO-0001" } }, true)?.status, 401);
  assert.equal(productionLoginDenial("hao@example.test", "0204", undefined, true)?.code, "PASSWORD_RESET_REQUIRED");
  assert.equal(productionLoginDenial("demo@lions.tw", "0204", undefined, false), null);
  const demoToken = await signSessionToken({ ...payload, email: "demo@lions.tw" }, key);
  assert.equal(await readSessionToken(demoToken, { key, production: true, findUser: async () => ({ ...payload, id: "u1", member: { memberNo: "TEST-001" } }) }), null);
  const renamedToken = await signSessionToken(payload, key);
  assert.equal(await readSessionToken(renamedToken, { key, production: true, findUser: async () => ({ ...payload, id: "u1", member: { memberNo: "DEMO-0001" } }) }), null);
});
