import assert from "node:assert/strict";
import { test } from "node:test";
import { createRuntimeSecretsResolver } from "../src/lib/runtime-secrets";
import { providerConfig, providerReauthAvailable, publicProviders } from "../src/lib/federated-auth";

const google = { NODE_ENV: "production", FEDERATED_AUTH_ENABLED: "true", OAUTH_APP_ORIGIN: "https://synthetic.example.invalid",
  GOOGLE_OAUTH_CLIENT_ID: "synthetic-google-client", GOOGLE_OAUTH_CLIENT_SECRET: "synthetic-google-secret" };
const apple = { APPLE_OAUTH_CLIENT_ID: "synthetic.apple.service", APPLE_OAUTH_TEAM_ID: "synthetic-team", APPLE_OAUTH_KEY_ID: "synthetic-key-id",
  APPLE_OAUTH_PRIVATE_KEY: "synthetic PRIVATE KEY marker, not a key", OAUTH_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"), APPLE_OAUTH_FRESH_REAUTH_ENABLED: "true" };
const enableApple = { APPLE_OAUTH_ENABLED: "true", EMAIL_ACTION_REAUTH_ENABLED: "true" };
const noLookup = async () => { throw Error("Secret lookup must not happen"); };

test("Apple is default-off even with complete legacy env credentials or a stored enable flag", async () => {
  const env = { ...google, ...apple, OAUTH_RUNTIME_SECRETS_ENABLED: "true" };
  const resolver = createRuntimeSecretsResolver({ environment: env, fetchSecret: noLookup });
  const settings = await resolver.getOAuthRuntimeSettings();
  assert.equal(providerConfig("apple", settings), null); assert.equal(providerConfig("apple", env), null);
  assert.equal("APPLE_OAUTH_PRIVATE_KEY" in settings, false); assert.ok(providerConfig("google", settings));
  const stored = createRuntimeSecretsResolver({ environment: { OAUTH_RUNTIME_SECRETS_ENABLED: "true" }, fetchSecret: async () => ({ ...google, ...apple, ...enableApple }) });
  assert.equal(providerConfig("apple", await stored.getOAuthRuntimeSettings()), null);
});

test("explicit runtime Apple and email step-up opt-ins accept a complete env bundle without AWS lookup", async () => {
  const settings = await createRuntimeSecretsResolver({ environment: { ...google, ...apple, ...enableApple, OAUTH_RUNTIME_SECRETS_ENABLED: "true" }, fetchSecret: noLookup }).getOAuthRuntimeSettings();
  assert.equal(providerConfig("apple", settings)?.clientId, apple.APPLE_OAUTH_CLIENT_ID);
  assert.ok(providerConfig("google", settings));
  // Email step-up does not make an Apple token proof of fresh provider auth.
  assert.equal(providerReauthAvailable("apple", settings), false);
});

test("Apple fallback is explicit and provider-scoped even when Google env is complete", async () => {
  let reads = 0;
  const settings = await createRuntimeSecretsResolver({ environment: { ...google, ...enableApple, OAUTH_RUNTIME_SECRETS_ENABLED: "true" }, fetchSecret: async () => {
    reads++; return { ...google, ...apple, GOOGLE_OAUTH_CLIENT_ID: "different-stored-google", GOOGLE_OAUTH_CLIENT_SECRET: "different-stored-secret", GOOGLE_OAUTH_FRESH_REAUTH_ENABLED: "true" };
  } }).getOAuthRuntimeSettings();
  assert.equal(reads, 1); assert.ok(providerConfig("apple", settings));
  assert.equal(providerConfig("google", settings)?.clientId, google.GOOGLE_OAUTH_CLIENT_ID);
  assert.equal(providerReauthAvailable("google", settings), false);
});
test("unavailable optional Apple fallback does not disable complete Google env or password secrets", async () => {
  const resolver = createRuntimeSecretsResolver({ environment: { ...google, DATABASE_URL: "synthetic-db", AUTH_SECRET: "synthetic-session-secret",
    ...enableApple, OAUTH_RUNTIME_SECRETS_ENABLED: "true" }, fetchSecret: async () => { throw Error("private failure must stay internal"); } });
  const settings = await resolver.getOAuthRuntimeSettings();
  assert.ok(providerConfig("google", settings)); assert.equal(providerConfig("apple", settings), null);
  assert.deepEqual(await resolver.getAppSecrets(), { DATABASE_URL: "synthetic-db", AUTH_SECRET: "synthetic-session-secret" });
});

test("no fallback opt-in or explicit global disable never probes AWS for Apple", async () => {
  for (const env of [{ ...google, ...enableApple }, { ...google, ...enableApple, FEDERATED_AUTH_ENABLED: "false", OAUTH_RUNTIME_SECRETS_ENABLED: "true" }]) {
    const settings = await createRuntimeSecretsResolver({ environment: env, fetchSecret: noLookup }).getOAuthRuntimeSettings();
    assert.equal(providerConfig("apple", settings), null);
  }
});

test("matching partial Apple sources can be completed; conflicting tuple/origin only disables Apple", async () => {
  const make = (env: Record<string, string>) => createRuntimeSecretsResolver({ environment: { ...google, ...enableApple, OAUTH_RUNTIME_SECRETS_ENABLED: "true", ...env },
    fetchSecret: async () => ({ ...google, ...apple }) }).getOAuthRuntimeSettings();
  assert.ok(providerConfig("apple", await make({ APPLE_OAUTH_CLIENT_ID: apple.APPLE_OAUTH_CLIENT_ID })));
  for (const key of Object.keys(apple).filter(key => key !== "APPLE_OAUTH_FRESH_REAUTH_ENABLED")) {
    const settings = await make({ [key]: "conflicting-synthetic-value" });
    assert.equal(providerConfig("apple", settings), null); assert.ok(providerConfig("google", settings));
  }
  const settings = await createRuntimeSecretsResolver({ environment: { ...google, ...enableApple, OAUTH_RUNTIME_SECRETS_ENABLED: "true" },
    fetchSecret: async () => ({ ...google, ...apple, OAUTH_APP_ORIGIN: "https://different.example.invalid" }) }).getOAuthRuntimeSettings();
  assert.equal(providerConfig("apple", settings), null); assert.ok(providerConfig("google", settings));
});

test("complete Apple env remains separate when an incomplete Google bundle needs fallback", async () => {
  const settings = await createRuntimeSecretsResolver({ environment: { NODE_ENV: "production", FEDERATED_AUTH_ENABLED: "true", OAUTH_APP_ORIGIN: google.OAUTH_APP_ORIGIN,
    ...apple, ...enableApple, OAUTH_RUNTIME_SECRETS_ENABLED: "true" }, fetchSecret: async () => ({ ...google, ...apple, APPLE_OAUTH_CLIENT_ID: "different-stored-apple" }) }).getOAuthRuntimeSettings();
  assert.equal(providerConfig("apple", settings)?.clientId, apple.APPLE_OAUTH_CLIENT_ID); assert.ok(providerConfig("google", settings));
});

test("email security gate, key format and provider flags fail closed; public provider output contains no settings", async () => {
  for (const change of [{ EMAIL_ACTION_REAUTH_ENABLED: "false" }, { OAUTH_TOKEN_ENCRYPTION_KEY: "invalid" }, { APPLE_OAUTH_PRIVATE_KEY: "invalid" }, { APPLE_OAUTH_ENABLED: "false" }]) {
    const settings = await createRuntimeSecretsResolver({ environment: { ...google, ...apple, ...enableApple, ...change }, fetchSecret: noLookup }).getOAuthRuntimeSettings();
    assert.equal(providerConfig("apple", settings), null); assert.ok(providerConfig("google", settings));
  }
  const settings = await createRuntimeSecretsResolver({ environment: { ...google, ...apple, ...enableApple }, fetchSecret: noLookup }).getOAuthRuntimeSettings();
  const output = JSON.stringify(publicProviders(settings));
  for (const value of [apple.APPLE_OAUTH_CLIENT_ID, apple.APPLE_OAUTH_TEAM_ID, apple.APPLE_OAUTH_KEY_ID, apple.APPLE_OAUTH_PRIVATE_KEY, apple.OAUTH_TOKEN_ENCRYPTION_KEY, google.GOOGLE_OAUTH_CLIENT_SECRET]) assert.equal(output.includes(value), false);
});

test("stored security flags cannot enable email step-up, and the Apple fresh flag never grants provider reauthentication", async () => {
  for (const emailFlag of [undefined, "false"]) {
    const settings = await createRuntimeSecretsResolver({ environment: { ...google, ...apple, APPLE_OAUTH_ENABLED: "true", EMAIL_ACTION_REAUTH_ENABLED: emailFlag,
      OAUTH_RUNTIME_SECRETS_ENABLED: "true" }, fetchSecret: async () => ({ ...google, ...apple, ...enableApple }) }).getOAuthRuntimeSettings();
    assert.equal(settings.EMAIL_ACTION_REAUTH_ENABLED, "false"); assert.equal(providerConfig("apple", settings), null);
  }
  for (const freshFlag of [undefined, "true", "false", "unrecognized"]) {
    const settings = await createRuntimeSecretsResolver({ environment: { ...google, ...apple, ...enableApple, APPLE_OAUTH_FRESH_REAUTH_ENABLED: freshFlag }, fetchSecret: noLookup }).getOAuthRuntimeSettings();
    assert.ok(providerConfig("apple", settings)); assert.equal(providerReauthAvailable("apple", settings), false);
  }
});
