import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import {
  signMobileAccessToken,
  signMobileRefreshToken,
  readMobileToken,
  bearerToken,
  MOBILE_ACCESS_TOKEN_DURATION_SECONDS,
  MOBILE_REFRESH_TOKEN_DURATION_SECONDS,
} from "../src/lib/mobile-auth";

const key = new TextEncoder().encode("synthetic-mobile-key-for-local-tests-only");
const payload = { userId: "u1", memberId: "m1", email: "a@example.test", sessionVersion: 1 };
const user = { id: "u1", memberId: "m1", email: "a@example.test", sessionVersion: 1, member: { memberNo: "TEST-001" } };

test("access and refresh tokens round-trip only against their own expected type", async () => {
  const access = await signMobileAccessToken(payload, key);
  const refresh = await signMobileRefreshToken(payload, key);
  const findUser = async () => user;

  assert.ok(await readMobileToken(access, "mobile_access", { key, findUser }));
  assert.ok(await readMobileToken(refresh, "mobile_refresh", { key, findUser }));

  // Type confusion: an access token must not work where a refresh token is expected, and vice versa.
  assert.equal(await readMobileToken(access, "mobile_refresh", { key, findUser }), null);
  assert.equal(await readMobileToken(refresh, "mobile_access", { key, findUser }), null);
});

test("sessionVersion revocation invalidates outstanding mobile access and refresh tokens together", async () => {
  const access = await signMobileAccessToken(payload, key);
  const refresh = await signMobileRefreshToken(payload, key);
  let version = 1;
  const findUser = async () => ({ ...user, sessionVersion: version });

  assert.ok(await readMobileToken(access, "mobile_access", { key, findUser }));
  version = 2; // e.g. "登出其他裝置" or password reset bumps this
  assert.equal(await readMobileToken(access, "mobile_access", { key, findUser }), null);
  assert.equal(await readMobileToken(refresh, "mobile_refresh", { key, findUser }), null);
});

test("expired access token is rejected even before its default 90-day refresh sibling would be", async () => {
  const now = Math.floor(Date.now() / 1000);
  const expiredAccess = await new SignJWT({ ...payload, typ: "mobile_access" })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt(now - MOBILE_ACCESS_TOKEN_DURATION_SECONDS - 10)
    .setExpirationTime(now - 10).sign(key);
  const findUser = async () => user;
  assert.equal(await readMobileToken(expiredAccess, "mobile_access", { key, findUser }), null);
});

test("production denies the public demo identity for mobile tokens the same way as web sessions", async () => {
  const demoPayload = { ...payload, email: "demo@lions.tw" };
  const access = await signMobileAccessToken(demoPayload, key);
  const findUser = async () => ({ ...user, email: "demo@lions.tw" });
  assert.equal(await readMobileToken(access, "mobile_access", { key, findUser, production: true }), null);
  assert.ok(await readMobileToken(access, "mobile_access", { key, findUser, production: false }));
});

test("findUser mismatch on memberId or missing user rejects the token", async () => {
  const access = await signMobileAccessToken(payload, key);
  assert.equal(await readMobileToken(access, "mobile_access", { key, findUser: async () => null }), null);
  assert.equal(await readMobileToken(access, "mobile_access", { key, findUser: async () => ({ ...user, memberId: "different-member" }) }), null);
});

test("durations match the documented short-access / long-refresh split", () => {
  assert.equal(MOBILE_ACCESS_TOKEN_DURATION_SECONDS, 15 * 60);
  assert.equal(MOBILE_REFRESH_TOKEN_DURATION_SECONDS, 60 * 60 * 24 * 90);
});

test("bearerToken extracts only a well-formed Authorization header", () => {
  assert.equal(bearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(bearerToken("bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(bearerToken(null), null);
  assert.equal(bearerToken("Basic dXNlcjpwYXNz"), null);
  assert.equal(bearerToken("Bearer"), null);
});
