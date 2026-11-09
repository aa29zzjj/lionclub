import assert from "node:assert/strict";
import { test } from "node:test";
import { readNativeOAuthProviders } from "../mobile-app/src/oauth-providers";

const payload = (google: boolean, apple: boolean) => ({ protocolVersion: 2,
  providers: [{ id: "google", enabled: google }, { id: "apple", enabled: apple }] });

test("native providers use the versioned server truth for disabled, one-provider and both-provider states", () => {
  assert.deepEqual(readNativeOAuthProviders(payload(false, false)), []);
  assert.deepEqual(readNativeOAuthProviders(payload(true, false)), ["google"]);
  assert.deepEqual(readNativeOAuthProviders(payload(false, true)), ["apple"]);
  assert.deepEqual(readNativeOAuthProviders(payload(true, true)), ["google", "apple"]);
});

test("legacy, partial, duplicate and malformed discovery cannot display an actionable provider", () => {
  for (const value of [null, {}, { ...payload(true, true), protocolVersion: 1 },
    { protocolVersion: 2, providers: [{ id: "google", enabled: true }] },
    { protocolVersion: 2, providers: [{ id: "google", enabled: true }, { id: "google", enabled: false }] },
    { protocolVersion: 2, providers: [{ id: "google", enabled: "true" }, { id: "apple", enabled: false }] },
    { protocolVersion: 2, providers: [{ id: "other", enabled: true }, { id: "apple", enabled: false }] },
  ]) assert.throws(() => readNativeOAuthProviders(value), /INVALID_PROVIDERS/);
});
