import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { mobilePushSettings, publicMobilePushConfig, MOBILE_PUSH_TOPIC, MOBILE_PUSH_LEASE_MS } from "../src/lib/mobile-push-config";
import { encryptPushToken, decryptPushToken, normalizedPushToken, pushTokenHash } from "../src/lib/mobile-push-crypto";
import { enqueueMobilePush, mobilePushReceiptFeed, registerMobilePushDevice, disableMobilePushDevice, pushRegistrationSchema, pushDisableSchema } from "../src/lib/mobile-push";
import { deliverMobilePush, processMobilePushBatch, mobilePushPayload, mobilePushRetryDelay, MOBILE_PUSH_MAX_ATTEMPTS } from "../src/lib/mobile-push-delivery";

const environment = { MOBILE_PUSH_ENABLED: "true", APNS_ENVIRONMENT: "sandbox", APNS_TOPIC: MOBILE_PUSH_TOPIC, PUSH_DEVICE_ENCRYPTION_KEY: "11".repeat(32) };
const settings = mobilePushSettings(environment);
const installationId = "f8f96843-23f4-4fbe-bc2f-ce91762d21dd";
const actor = { userId: "synthetic-user", memberId: "synthetic-member", sessionVersion: 1 };
const binding = { ...actor, installationId, environment: "sandbox", topic: MOBILE_PUSH_TOPIC, bindingVersion: 1 };
const token = "ab".repeat(32);

test("push remains off unless all explicit server-only settings are complete", () => {
  assert.equal(mobilePushSettings({}).enabled, false);
  assert.equal(mobilePushSettings({ ...environment, MOBILE_PUSH_ENABLED: "false" }).enabled, false);
  assert.equal(mobilePushSettings({ ...environment, MOBILE_PUSH_ENABLED: "TRUE" }).enabled, false);
  for (const key of Object.keys(environment)) assert.equal(mobilePushSettings({ ...environment, [key]: undefined }).enabled, false, key);
  assert.equal(mobilePushSettings({ ...environment, APNS_ENVIRONMENT: "development" }).enabled, false);
  assert.equal(mobilePushSettings({ ...environment, APNS_TOPIC: "other.app" }).enabled, false);
  assert.equal(mobilePushSettings({ ...environment, PUSH_DEVICE_ENCRYPTION_KEY: "11".repeat(31) }).enabled, false);
  assert.equal(mobilePushSettings({ NEXT_PUBLIC_MOBILE_PUSH_ENABLED: "true", NEXT_PUBLIC_PUSH_DEVICE_ENCRYPTION_KEY: "11".repeat(32) }).enabled, false);
  assert.equal(settings.enabled, true); assert.equal(MOBILE_PUSH_LEASE_MS, 86400000);
});
test("public push config never contains the encryption key or invents an environment when unavailable", () => {
  assert.deepEqual(publicMobilePushConfig({ enabled: false }), { enabled: false, environment: null, topic: null, privacyMode: "generic" });
  assert.deepEqual(publicMobilePushConfig(settings), { enabled: true, environment: "sandbox", topic: MOBILE_PUSH_TOPIC, privacyMode: "generic" });
  assert.equal(JSON.stringify(publicMobilePushConfig(settings)).includes(environment.PUSH_DEVICE_ENCRYPTION_KEY), false);
});
test("device token encryption is randomized and cryptographically bound to account, installation and environment", () => {
  const a = encryptPushToken(token.toUpperCase(), binding, settings), b = encryptPushToken(token, binding, settings);
  assert.notEqual(a, b); assert.equal(a.includes(token), false); assert.equal(decryptPushToken(a, binding, settings), token);
  for (const change of [{ userId: "other-user" }, { memberId: "other-member" }, { installationId: "another-installation" },
    { sessionVersion: 2 }, { bindingVersion: 2 }, { topic: "another.app" }, { environment: "production" }]) {
    assert.throws(() => decryptPushToken(a, { ...binding, ...change }, settings), /PUSH_TOKEN_UNAVAILABLE/);
  }
  assert.throws(() => decryptPushToken(a, binding, mobilePushSettings({ ...environment, PUSH_DEVICE_ENCRYPTION_KEY: "22".repeat(32) })), /PUSH_TOKEN_UNAVAILABLE/);
  assert.throws(() => decryptPushToken("v1.invalid.invalid.invalid", binding, settings), /PUSH_TOKEN_UNAVAILABLE/);
  assert.throws(() => encryptPushToken(token, binding, { enabled: false }), /PUSH_NOT_CONFIGURED/);
});
test("token validation accepts bounded variable-length hex tokens, not URLs, whitespace or malformed hex", () => {
  assert.equal(normalizedPushToken("AB".repeat(16)), "ab".repeat(16));
  assert.equal(normalizedPushToken("de".repeat(80)).length, 160);
  assert.equal(pushTokenHash(token), pushTokenHash(token.toUpperCase()));
  for (const invalid of ["", "ab".repeat(15), "ab".repeat(257), "f".repeat(65), "zz".repeat(32), "https://example.test", token + "\n"]) assert.throws(() => normalizedPushToken(invalid));
});
test("registration and disable require monotonic safe-integer revisions and reject client-selected identities", () => {
  const input = { installationId, revision: 1, token, authorization: "granted" };
  assert.equal(pushRegistrationSchema.safeParse(input).success, true);
  assert.equal(pushDisableSchema.safeParse({ installationId, revision: 2 }).success, true);
  for (const extra of [{ userId: "other-user" }, { memberId: "other-member" }, { environment: "production" }, { topic: "other.app" }]) assert.equal(pushRegistrationSchema.safeParse({ ...input, ...extra }).success, false);
  for (const revision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "2"]) assert.equal(pushRegistrationSchema.safeParse({ ...input, revision }).success, false);
  assert.equal(pushRegistrationSchema.safeParse({ ...input, authorization: "denied" }).success, false);
  assert.equal(pushDisableSchema.safeParse({ installationId: "not-a-uuid", revision: 1 }).success, false);
});
test("disabled foundation cannot query new tables, call a transport or mutate the database", async () => {
  const database = new Proxy({}, { get() { assert.fail("Disabled push touched a database"); } }) as PrismaClient;
  const transport = async () => { assert.fail("Disabled push called provider"); };
  assert.deepEqual(await enqueueMobilePush(database, { kind: "activity", sourceId: "notice", actorId: "sender", recipientMemberIds: [actor.memberId] }, { enabled: false }), { enabled: false, receiptCount: 0, deliveryCount: 0 });
  assert.deepEqual(await mobilePushReceiptFeed(database, actor, { enabled: false }), { enabled: false, receipts: [], unreadCount: 0 });
  assert.deepEqual(await deliverMobilePush(database, "job", transport, { enabled: false }), { status: "disabled" });
  assert.deepEqual(await processMobilePushBatch(database, transport, { enabled: false }), { enabled: false, processed: 0 });
  await assert.rejects(registerMobilePushDevice(database, actor, { installationId, revision: 1, token, authorization: "granted" }, { enabled: false }), /尚未啟用/);
  await assert.rejects(disableMobilePushDevice(database, actor, { installationId, revision: 1 }, { enabled: false }), /尚未啟用/);
});
test("all lock-screen payloads are generic and contain only a fixed versioned notification kind", () => {
  for (const kind of ["activity", "friend_invitation", "experience_review", "membership_review"] as const) {
    const payload = mobilePushPayload(kind);
    assert.deepEqual(payload.data, { version: 1, kind });
    assert.deepEqual(Object.keys(payload.aps), ["alert", "sound"]);
    assert.equal(payload.aps.alert.title, "LionClubs");
    assert.equal(payload.aps.alert.body, "你有一則新的通知，開啟 App 查看。");
    assert.doesNotMatch(JSON.stringify(payload), /https?:|sourceId|userId|memberId|eventId|reason|name/);
  }
});
test("provider retry delay is bounded, backs off and preserves Apple's 15-minute floor for unavailable responses", () => {
  assert.equal(MOBILE_PUSH_MAX_ATTEMPTS, 5);
  assert.equal(mobilePushRetryDelay(1, "unavailable"), 900000);
  assert.equal(mobilePushRetryDelay(1, "rate-limited"), 60000);
  assert.equal(mobilePushRetryDelay(2, "rate-limited"), 120000);
  assert.ok(mobilePushRetryDelay(999, "unavailable") <= 6 * 3600000);
});
