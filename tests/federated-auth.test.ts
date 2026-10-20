import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import { generateKeyPair, SignJWT } from "jose";
import { authorizationUrl, decryptProviderToken, encryptProviderToken, hashOAuthSecret, providerConfig, publicProviders, randomOAuthSecret, verifyFreshProviderAuthentication, verifyProviderToken, providerReauthAvailable } from "../src/lib/federated-auth";
import type { ProviderConfig } from "../src/lib/federated-auth";
import { sendPasswordResetEmail, completePasswordReset } from "../src/lib/password-reset";
import { revokeOtherSessions } from "../src/lib/session-revocation";
import type { PrismaClient } from "@prisma/client";

const config: ProviderConfig = { provider: "google", clientId: "synthetic-client", clientSecret: "synthetic-secret", origin: "https://app.example.test", callback: "https://app.example.test/api/auth/oauth/google/callback" };
const now = new Date("2026-10-20T06:00:00Z");
const seconds = Math.floor(+now / 1000);
const keyPromise = generateKeyPair("RS256");
const claims = { iss: "https://accounts.google.com", aud: config.clientId, sub: "stable-provider-subject", email: "Person@example.test", email_verified: true, nonce: "synthetic-nonce", iat: seconds, exp: seconds + 600 };
const signed = async (changes = {}) => new SignJWT({ ...claims, ...changes }).setProtectedHeader({ alg: "RS256" }).sign((await keyPromise).privateKey);

test("OAuth defaults are disabled and public availability contains no credentials", () => {
  assert.equal(providerConfig("google", {}), null);
  const env = { FEDERATED_AUTH_ENABLED: "true", NEXT_PUBLIC_APP_URL: "https://app.example.test", GOOGLE_OAUTH_CLIENT_ID: "client", GOOGLE_OAUTH_CLIENT_SECRET: "secret" };
  assert.ok(providerConfig("google", env));
  assert.equal(providerConfig("google", { ...env, NEXT_PUBLIC_APP_URL: "https://attacker.example.test/path" }), null);
  assert.equal(providerConfig("google", { ...env, NEXT_PUBLIC_APP_URL: "https://user:password@app.example.test" }), null);
  assert.equal(providerConfig("google", { ...env, NEXT_PUBLIC_APP_URL: "http://app.example.test", NODE_ENV: "production" }), null);
  assert.equal(providerConfig("apple", env), null);
  assert.equal(JSON.stringify(publicProviders(env)).includes("secret"), false);
});
test("PKCE S256, state, nonce and callbacks are fixed; no client return URL/invite goes to provider", () => {
  const verifier = randomOAuthSecret(), state = randomOAuthSecret(), nonce = randomOAuthSecret();
  const url = new URL(authorizationUrl(config, state, nonce, verifier, "login"));
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("redirect_uri"), config.callback);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), crypto.createHash("sha256").update(verifier).digest("base64url"));
  assert.equal(url.searchParams.get("state"), state); assert.equal(url.searchParams.get("nonce"), nonce);
  assert.equal(url.searchParams.has("returnTo"), false); assert.equal(url.searchParams.has("token"), false);
  assert.notEqual(hashOAuthSecret(state), state);
});
test("real signed OIDC token returns stable subject and normalized verified email", async () => {
  const keys = await keyPromise;
  const verified = await verifyProviderToken(await signed(), config, claims.nonce, { key: keys.publicKey, now });
  assert.equal(verified.subject, claims.sub); assert.equal(verified.email, "person@example.test");
});
test("OIDC rejects issuer, audience, nonce, unsigned/unverified/expired/old/future/missing-sub and azp confusion", async () => {
  const keys = await keyPromise;
  for (const change of [
    { iss: "https://attacker.example.test" }, { aud: "another-client" }, { nonce: "replayed-nonce" }, { email_verified: false },
    { email_verified: "false" }, { exp: seconds - 100 }, { iat: seconds - 700 }, { iat: seconds + 100 }, { sub: "" },
    { email: "not-an-email" }, { azp: "another-client" }, { aud: [config.clientId, "other"], azp: undefined },
  ]) await assert.rejects(() => signed(change).then(token => verifyProviderToken(token, config, claims.nonce, { key: keys.publicKey, now })));
  const attacker = await generateKeyPair("RS256");
  const token = await new SignJWT(claims).setProtectedHeader({ alg: "RS256" }).sign(attacker.privateKey);
  await assert.rejects(() => verifyProviderToken(token, config, claims.nonce, { key: keys.publicKey, now }));
});
test("Apple uses hybrid form_post, signed c_hash binding, nonce and its exact issuer/audience", async () => {
  const keys = await keyPromise;
  const apple = { ...config, provider: "apple" as const, callback: "https://app.example.test/api/auth/oauth/apple/callback" };
  const code = "synthetic-single-use-apple-code";
  const hash = crypto.createHash("sha256").update(code).digest().subarray(0, 16).toString("base64url");
  const token = await signed({ iss: "https://appleid.apple.com", c_hash: hash, email_verified: "true" });
  assert.equal((await verifyProviderToken(token, apple, claims.nonce, { key: keys.publicKey, now, code, requireCodeHash: true })).subject, claims.sub);
  await assert.rejects(() => verifyProviderToken(token, apple, claims.nonce, { key: keys.publicKey, now, code: "swapped-code", requireCodeHash: true }));
  const url = new URL(authorizationUrl(apple, randomOAuthSecret(), randomOAuthSecret(), randomOAuthSecret(), "login"));
  assert.equal(url.searchParams.get("response_type"), "code id_token"); assert.equal(url.searchParams.get("response_mode"), "form_post");
  assert.equal(url.searchParams.has("code_challenge"), false, "do not claim unsupported Apple PKCE");
});
test("newly issued ID token is not proof of fresh authentication; signed auth_time must be recent and flow-bound", () => {
  assert.throws(() => verifyFreshProviderAuthentication({ iat: seconds }, now, now));
  assert.throws(() => verifyFreshProviderAuthentication({ auth_time: seconds - 500 }, now, now));
  assert.throws(() => verifyFreshProviderAuthentication({ auth_time: seconds - 100 }, now, now));
  assert.throws(() => verifyFreshProviderAuthentication({ auth_time: seconds + 100 }, now, now));
  assert.doesNotThrow(() => verifyFreshProviderAuthentication({ auth_time: seconds }, now, now));
  assert.equal(providerReauthAvailable("apple", {}), false);
});
test("Apple token storage is authenticated encryption; wrong key and tampering fail closed", () => {
  const key = Buffer.alloc(32, 7).toString("base64"), wrong = Buffer.alloc(32, 9).toString("base64");
  const encrypted = encryptProviderToken("synthetic-refresh-token", key);
  assert.equal(encrypted.includes("synthetic-refresh-token"), false);
  assert.equal(decryptProviderToken(encrypted, key), "synthetic-refresh-token");
  assert.throws(() => decryptProviderToken(encrypted, wrong));
  const pieces = encrypted.split("."); pieces[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => decryptProviderToken(pieces.join("."), key));
  assert.throws(() => encryptProviderToken("test", "placeholder"));
});
test("OAuth-only users cannot get a local password through forgot/reset or bcrypt session confirmation", async () => {
  const user = { id: "oauth-user", email: "oauth@example.test", passwordHash: null, memberId: "oauth-member", sessionVersion: 1, member: { memberNo: null } };
  let sent = 0, passwordChecked = 0, mutation = 0;
  const fake = {
    user: { findUnique: async () => user, updateMany: async () => { mutation++; return { count: 1 }; } },
    passwordResetToken: { findUnique: async () => ({ id: "token", userId: user.id, email: user.email, usedAt: null, expiresAt: new Date(Date.now() + 60_000) }) },
    $transaction: async (run: (tx: unknown) => unknown) => run(fake),
  };
  const db = fake as unknown as PrismaClient;
  assert.deepEqual(await sendPasswordResetEmail(db, { userId: user.id, requestedEmail: user.email, appOrigin: config.origin }, { from: "test@example.test", sender: async () => { sent++; } }), { sent: false });
  await assert.rejects(() => completePasswordReset(db, "synthetic-reset-token", "should-not-set-password"));
  await assert.rejects(() => revokeOtherSessions(db, { userId: user.id, memberId: user.memberId, email: user.email, sessionVersion: 1 }, "", {
    verifyPassword: async () => { passwordChecked++; return true; }, renewSession: async () => {}, clearSession: async () => {},
  }));
  assert.equal(sent, 0); assert.equal(passwordChecked, 0); assert.equal(mutation, 0);
});
