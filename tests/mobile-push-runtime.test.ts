import assert from "node:assert/strict";
import { test } from "node:test";
import { createMobilePushRuntimeResolver } from "../src/lib/mobile-push-runtime";
import { publicRuntimeEnvironment, renderPublicRuntimeEnvironment } from "../scripts/write-amplify-runtime-env.mjs";
const base = { MOBILE_PUSH_ENABLED: "true", APNS_ENVIRONMENT: "sandbox", APNS_TOPIC: "com.lionclubsmembership.app" };
test("unconfigured push never probes the credential chain or a default secret", async () => {
  for (const environment of [{}, base, { ...base, MOBILE_PUSH_RUNTIME_SECRETS_ENABLED: "true" }]) {
    const resolve = createMobilePushRuntimeResolver({ environment, fetchSecret: async () => { assert.fail("No implicit secret read"); } });
    assert.deepEqual(await resolve(), { enabled: false });
  }
});
test("explicit nonsecret secret reference resolves only an encryption key, caches and never returns provider credentials", async () => {
  let calls = 0;
  const resolve = createMobilePushRuntimeResolver({ environment: { ...base, MOBILE_PUSH_RUNTIME_SECRETS_ENABLED: "true", MOBILE_PUSH_SECRETS_NAME: "synthetic/push" },
    fetchSecret: async name => { calls++; assert.equal(name, "synthetic/push"); return { PUSH_DEVICE_ENCRYPTION_KEY: "11".repeat(32), APNS_PRIVATE_KEY: "not-returned", DATABASE_URL: "not-returned" }; } });
  const [a, b] = await Promise.all([resolve(), resolve()]); assert.equal(a.enabled, true); assert.deepEqual(a, b); assert.equal(calls, 1);
  assert.equal(Object.hasOwn(a, "APNS_PRIVATE_KEY"), false); assert.equal(Object.hasOwn(a, "DATABASE_URL"), false);
});
test("an invalid explicit encryption key cannot borrow a different secret; unavailable runtime fails closed", async () => {
  const explicit = createMobilePushRuntimeResolver({ environment: { ...base, PUSH_DEVICE_ENCRYPTION_KEY: "invalid", MOBILE_PUSH_RUNTIME_SECRETS_ENABLED: "true", MOBILE_PUSH_SECRETS_NAME: "synthetic/push" },
    fetchSecret: async () => { assert.fail("Do not mix sources"); } });
  assert.deepEqual(await explicit(), { enabled: false });
  const missing = createMobilePushRuntimeResolver({ environment: { ...base, MOBILE_PUSH_RUNTIME_SECRETS_ENABLED: "true", MOBILE_PUSH_SECRETS_NAME: "synthetic/push" }, fetchSecret: async () => { throw Error("private-provider-error"); } });
  assert.deepEqual(await missing(), { enabled: false });
});
test("Amplify artifacts allow only push flags/references, never encryption, APNs credentials or worker DB values", () => {
  const environment = { ...base, MOBILE_PUSH_RUNTIME_SECRETS_ENABLED: "true", MOBILE_PUSH_SECRETS_NAME: "synthetic/push",
    PUSH_DEVICE_ENCRYPTION_KEY: "synthetic-private-key", APNS_PRIVATE_KEY: "synthetic-provider-key", APNS_KEY_ID: "PRIVATEKEY", PUSH_DATABASE_URL: "synthetic-db", PUSH_DELIVERY_ENABLED: "true" };
  assert.deepEqual(publicRuntimeEnvironment(environment), { ...base, MOBILE_PUSH_RUNTIME_SECRETS_ENABLED: "true", MOBILE_PUSH_SECRETS_NAME: "synthetic/push" });
  const rendered = renderPublicRuntimeEnvironment(environment);
  for (const key of ["PUSH_DEVICE_ENCRYPTION_KEY", "APNS_PRIVATE_KEY", "APNS_KEY_ID", "PUSH_DATABASE_URL", "PUSH_DELIVERY_ENABLED"]) assert.equal(rendered.includes(key), false);
});
