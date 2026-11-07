import assert from "node:assert/strict";
import { test } from "node:test";
import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import type { PrismaClient } from "@prisma/client";
import { createRuntimeSecretsResolver } from "../src/lib/runtime-secrets";
import { decryptProviderToken, encryptProviderToken, hashOAuthSecret, providerConfig, randomOAuthSecret, revokeAppleToken } from "../src/lib/federated-auth";
import { acceptOAuthCallback, revokeLinkedAppleBeforeDeletion } from "../src/lib/federated-auth-service";

const pair = generateKeyPair("ES256", { extractable: true });
async function storedOnlyConfig() {
  const key = Buffer.alloc(32, 9).toString("base64");
  const settings = { APPLE_OAUTH_CLIENT_ID: "synthetic.apple.service", APPLE_OAUTH_TEAM_ID: "synthetic-team", APPLE_OAUTH_KEY_ID: "synthetic-key-id",
    APPLE_OAUTH_PRIVATE_KEY: await exportPKCS8((await pair).privateKey), OAUTH_TOKEN_ENCRYPTION_KEY: key, APPLE_OAUTH_FRESH_REAUTH_ENABLED: "true",
    OAUTH_APP_ORIGIN: "https://synthetic.example.invalid" };
  // Neither Apple credentials nor the encryption key exist in this runtime env.
  const environment = { NODE_ENV: "production", FEDERATED_AUTH_ENABLED: "true", OAUTH_RUNTIME_SECRETS_ENABLED: "true", APPLE_OAUTH_ENABLED: "true",
    OAUTH_APP_ORIGIN: settings.OAUTH_APP_ORIGIN, GOOGLE_OAUTH_CLIENT_ID: "synthetic-google", GOOGLE_OAUTH_CLIENT_SECRET: "synthetic-google-secret" };
  const resolver = createRuntimeSecretsResolver({ environment, fetchSecret: async () => settings });
  const resolve = async () => providerConfig("apple", await resolver.getOAuthRuntimeSettings());
  const config = await resolve(); assert.ok(config);
  return { key, config, resolve };
}

test("Apple callback encrypts refresh tokens with the same resolved stored-only bundle", async () => {
  const { key, config } = await storedOnlyConfig();
  const state = randomOAuthSecret(), browser = randomOAuthSecret(), now = new Date(); let ciphertext = "";
  const row = { id: "synthetic-transaction", provider: "apple", purpose: "login", nativeRedirectUri: null,
    browserHash: hashOAuthSecret(browser), expiresAt: new Date(+now + 60_000), claimedAt: null, completedAt: null,
    nonce: randomOAuthSecret(), createdAt: now, codeVerifier: null };
  const prisma = { oAuthTransaction: { async findUnique() { return row; }, async updateMany(input: any) {
    if (input.data.refreshTokenCiphertext) ciphertext = input.data.refreshTokenCiphertext;
    return { count: 1 };
  } } } as unknown as PrismaClient;
  await acceptOAuthCallback(prisma, "apple", state, browser, { code: "synthetic-code", idToken: "synthetic-front-token" }, {
    config, exchange: async () => ({ idToken: "synthetic-back-token", refreshToken: "synthetic-refresh-token" }),
    verify: async () => ({ subject: "synthetic-subject", email: "synthetic@example.invalid", payload: {} }),
  });
  assert.ok(ciphertext.startsWith("v1.")); assert.notEqual(ciphertext, "synthetic-refresh-token");
  assert.equal(decryptProviderToken(ciphertext, key), "synthetic-refresh-token");
});

test("account-deletion revocation uses stored-only resolved config and decrypts without env copies", async () => {
  const { key, resolve } = await storedOnlyConfig();
  const updatedAt = new Date("2026-11-07T00:00:00Z");
  const identities = [{ id: "synthetic-identity", updatedAt, provider: "apple", refreshTokenCiphertext: encryptProviderToken("synthetic-refresh-token", key) }];
  const prisma = { federatedIdentity: { async findMany() { return identities; } } } as unknown as PrismaClient;
  let requests = 0;
  const fetcher: typeof fetch = async (input, init) => {
    requests++; assert.equal(String(input), "https://appleid.apple.com/auth/revoke");
    const body = init!.body as URLSearchParams;
    assert.equal(body.get("token"), "synthetic-refresh-token"); assert.equal(body.get("client_id"), "synthetic.apple.service");
    const verified = await jwtVerify(body.get("client_secret")!, (await pair).publicKey, { issuer: "synthetic-team", audience: "https://appleid.apple.com", subject: "synthetic.apple.service" });
    assert.equal(verified.protectedHeader.kid, "synthetic-key-id");
    return new Response(null, { status: 200 });
  };
  const result = await revokeLinkedAppleBeforeDeletion(prisma, "synthetic-user", (ciphertext, config) => revokeAppleToken(ciphertext, config, fetcher), resolve);
  assert.deepEqual(result, [{ id: "synthetic-identity", updatedAt }]); assert.equal(requests, 1);
});

test("password/Google-only deletion never asks for Apple config", async () => {
  const updatedAt = new Date("2026-11-07T00:00:00Z");
  const identities = [{ id: "synthetic-google", updatedAt, provider: "google" }];
  const prisma = { federatedIdentity: { async findMany() { return identities; } } } as unknown as PrismaClient;
  const result = await revokeLinkedAppleBeforeDeletion(prisma, "synthetic-user", async () => { throw Error("Must not revoke"); }, async () => { throw Error("Must not resolve Apple"); });
  assert.deepEqual(result, [{ id: "synthetic-google", updatedAt }]);
});

test("missing resolved encryption key or failed revocation rejects instead of returning a deletion snapshot", async () => {
  const { key, config } = await storedOnlyConfig();
  const ciphertext = encryptProviderToken("synthetic-refresh-token", key);
  const prisma = { federatedIdentity: { async findMany() { return [{ id: "synthetic-identity", provider: "apple", refreshTokenCiphertext: ciphertext }]; } } } as unknown as PrismaClient;
  let requests = 0;
  const fetcher: typeof fetch = async () => { requests++; return new Response(null, { status: 503 }); };
  await assert.rejects(revokeAppleToken(ciphertext, { ...config, tokenEncryptionKey: undefined }, fetcher), { code: "TOKEN_STORAGE_UNCONFIGURED" });
  assert.equal(requests, 0);
  await assert.rejects(revokeLinkedAppleBeforeDeletion(prisma, "synthetic-user", (token, current) => revokeAppleToken(token, current, fetcher), async () => config), { code: "APPLE_REVOCATION_FAILED" });
  assert.equal(requests, 1);
});
