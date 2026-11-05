import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createApnsProvider, classifyApnsResponse } from "../src/lib/apns-provider";
import { mobilePushPayload } from "../src/lib/mobile-push-delivery";
import { parsePushWorkerArguments } from "../scripts/mobile-push-worker.mjs";

test("APNs outcomes never confuse provider acceptance with device delivery", () => {
  assert.deepEqual(classifyApnsResponse(200), { kind: "accepted" });
  for (const [status, reason] of [[410, "Unregistered"], [400, "BadDeviceToken"], [400, "DeviceTokenNotForTopic"]] as const) assert.deepEqual(classifyApnsResponse(status, reason), { kind: "invalid-token" });
  assert.deepEqual(classifyApnsResponse(429), { kind: "retryable", reason: "rate-limited" });
  for (const status of [500, 503]) assert.deepEqual(classifyApnsResponse(status), { kind: "retryable", reason: "unavailable" });
  for (const status of [0, 302, 403, 404]) assert.deepEqual(classifyApnsResponse(status), { kind: "rejected" });
});
test("provider construction uses a synthetic P-256 private key; invalid requests fail before connecting", async () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const provider = createApnsProvider({ key: privateKey, teamId: "SYNTHETIC1", keyId: "SYNTHETIC2" });
  try {
    await assert.rejects(provider.send({ token: "not-a-token", environment: "sandbox", topic: "com.lionclubsmembership.app",
      apnsId: "synthetic", collapseId: "11".repeat(32), expiration: 0, payload: mobilePushPayload("activity") }), /APNS_REQUEST_INVALID/);
    assert.throws(() => createApnsProvider({ key: privateKey, teamId: "invalid", keyId: "SYNTHETIC2" }));
  } finally { provider.close(); }
});
test("worker plan is zero-network and execution cannot borrow a default/unencrypted DB or omit target confirmations", () => {
  assert.deepEqual(parsePushWorkerArguments(["--plan"], {}), { mode: "plan" });
  const plan = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "scripts/mobile-push-worker.mjs", "--plan"], { encoding: "utf8" }));
  for (const key of ["connectsDatabase", "sendsPush", "readsKey", "createsResources"]) assert.equal(plan[key], false);
  assert.throws(() => parsePushWorkerArguments([], {})); assert.throws(() => parsePushWorkerArguments(["--execute"], {}));
  const env = { MOBILE_PUSH_ENABLED: "true", PUSH_DELIVERY_ENABLED: "true", APNS_ENVIRONMENT: "sandbox", APNS_TOPIC: "com.lionclubsmembership.app", PUSH_DEVICE_ENCRYPTION_KEY: "11".repeat(32),
    PUSH_DATABASE_URL: "postgresql://synthetic:unused@db.example.invalid/review?sslmode=verify-full", APNS_KEY_ID: "SYNTHETIC2", APNS_TEAM_ID: "SYNTHETIC1", PUSH_APNS_KEY_PATH: "/not-read/synthetic.p8" };
  const args = ["--execute", "--confirm-host", "db.example.invalid", "--confirm-database", "review", "--confirm-topic", "com.lionclubsmembership.app", "--confirm-environment", "sandbox"];
  assert.equal(parsePushWorkerArguments(args, env).mode, "execute");
  assert.throws(() => parsePushWorkerArguments(args, { ...env, PUSH_DATABASE_URL: "postgresql://synthetic:unused@db.example.invalid/review" }));
  assert.throws(() => parsePushWorkerArguments(args, { ...env, PUSH_DATABASE_URL: undefined, DATABASE_URL: env.PUSH_DATABASE_URL }));
  assert.throws(() => parsePushWorkerArguments(args, { ...env, APNS_ENVIRONMENT: "production" }));
});
