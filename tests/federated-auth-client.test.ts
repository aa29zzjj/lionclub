import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OAuthClientError, cancelFederatedSignup, oauthErrorMessage, readAuthMethods,
  readOAuthProviders, readPendingFederatedProfile, startFederatedLogin,
} from "../src/lib/federated-auth-client";

type Transport = Parameters<typeof readOAuthProviders>[0];
const json = (data: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(data), { status, headers });
const providerData = { providers: [{ id: "google", name: "untrusted display name", enabled: true }, { id: "apple", enabled: false, reasonCode: "PROVIDER_DISABLED" }] };
const returns = (data: unknown): Transport => async () => json(data);
const rejectsCode = (code: string) => (error: unknown) => error instanceof OAuthClientError && error.code === code && Boolean(error.message);
const googleUrl = "https://accounts.google.com/o/oauth2/v2/auth?client_id=synthetic&state=synthetic&scope=openid";

test("providers require exactly one Google and Apple and sanitize public display fields", async () => {
  let count = 0;
  const result = await readOAuthProviders(async (url, init) => {
    count++; assert.equal(url, "/api/auth/providers");
    assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store"); assert.ok(init?.signal instanceof AbortSignal);
    return json({ ...providerData, clientSecret: "NOT_PUBLIC", providers: providerData.providers.map(entry => ({ ...entry, clientSecret: "NOT_PUBLIC" })) });
  });
  assert.equal(count, 1);
  assert.deepEqual(result, [{ id: "google", name: "Google", enabled: true }, { id: "apple", name: "Apple", enabled: false, reasonCode: "PROVIDER_DISABLED" }]);
  assert.equal(JSON.stringify(result).includes("NOT_PUBLIC"), false);
  for (const data of [null, [], {}, { providers: [] }, { providers: [providerData.providers[0]] },
    { providers: [...providerData.providers, providerData.providers[0]] },
    { providers: [providerData.providers[0], providerData.providers[0]] },
    { providers: [{ id: "meta", enabled: true }, providerData.providers[1]] },
    { providers: [{ id: "google", enabled: "true" }, providerData.providers[1]] },
    { providers: [null, providerData.providers[1]] }]) {
    await assert.rejects(() => readOAuthProviders(returns(data)), rejectsCode("OAUTH_RESPONSE_INVALID"));
  }
});

test("provider transport/network/malformed failures do not retry, but a caller can explicitly retry", async () => {
  let calls = 0;
  const recoverable: Transport = async () => {
    calls++;
    if (calls === 1) throw new TypeError("PRIVATE_NETWORK_ERROR");
    return json(providerData);
  };
  await assert.rejects(() => readOAuthProviders(recoverable), error => rejectsCode("OAUTH_NETWORK")(error) && error instanceof Error && !error.message.includes("PRIVATE"));
  assert.equal(calls, 1);
  assert.equal((await readOAuthProviders(recoverable)).length, 2); assert.equal(calls, 2);
  for (const response of [new Response("<html>private error</html>"), new Response(null, { status: 204 }), json("not an object")]) {
    await assert.rejects(() => readOAuthProviders(async () => response), rejectsCode("OAUTH_RESPONSE_INVALID"));
  }
});

test("pre-aborted and active caller aborts reach the fetch signal and become recoverable network errors", async () => {
  const before = new AbortController(); before.abort(); let calls = 0;
  await assert.rejects(() => readOAuthProviders(async (_url, init) => {
    calls++; assert.equal(init?.signal?.aborted, true); throw new DOMException("Synthetic aborted fetch", "AbortError");
  }, before.signal), rejectsCode("OAUTH_NETWORK"));
  assert.equal(calls, 1);

  const active = new AbortController(); let observed: AbortSignal | null | undefined;
  const pending = readOAuthProviders((_url, init) => {
    calls++; observed = init?.signal;
    return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Synthetic abort", "AbortError")), { once: true }));
  }, active.signal);
  active.abort(); await assert.rejects(pending, rejectsCode("OAUTH_NETWORK"));
  assert.equal(observed?.aborted, true); assert.equal(calls, 2);
});

test("a stalled request aborts at fifteen seconds with no real wait or automatic retry", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0; let signal: AbortSignal | null | undefined;
  try {
    const pending = readOAuthProviders((_url, init) => {
      calls++; signal = init?.signal;
      return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("synthetic timeout", "AbortError")), { once: true }));
    });
    const failure = assert.rejects(pending, rejectsCode("OAUTH_NETWORK"));
    t.mock.timers.tick(14999); assert.equal(signal?.aborted, false);
    t.mock.timers.tick(1); await failure;
    assert.equal(signal?.aborted, true); assert.equal(calls, 1);
  } finally { t.mock.timers.reset(); }
});

test("completed requests clear their timeout and detach caller abort listeners", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const caller = new AbortController(); let signal: AbortSignal | null | undefined;
  try {
    await readOAuthProviders(async (_url, init) => { signal = init?.signal; return json(providerData); }, caller.signal);
    t.mock.timers.tick(15000); caller.abort();
    assert.equal(signal?.aborted, false);
  } finally { t.mock.timers.reset(); }
});

test("methods preserve password and linked providers, minimize identity fields and default reauth unavailable", async () => {
  const result = await readAuthMethods(async (url, init) => {
    assert.equal(url, "/api/me/auth-methods"); assert.equal(init?.credentials, "same-origin");
    return json({ hasPassword: true, available: true, identities: [
      { provider: "google", email: "synthetic@example.test", subject: "MUST_NOT_RETURN", reauthAvailable: true, reauthReason: "x".repeat(240) },
      { provider: "apple", email: null },
    ], reauthenticated: true, reauthActions: ["link", "delete", "sessions", "unknown", null] });
  });
  assert.equal(result.hasPassword, true); assert.equal(result.available, true); assert.equal(result.reauthenticated, true);
  assert.deepEqual(result.reauthActions, ["link", "delete", "sessions"]);
  assert.equal(result.identities[0].reauthReason?.length, 200); assert.equal(result.identities[1].reauthAvailable, false);
  assert.equal(JSON.stringify(result).includes("MUST_NOT_RETURN"), false);
});

test("delete proofs authorize account deletion; malformed/legacy flags still fail closed", async () => {
  const base = { hasPassword: false, identities: [], reauthenticated: true };
  for (const reauthActions of [undefined, null, "delete", ["DELETE", 1, {}]]) {
    const result = await readAuthMethods(returns({ ...base, reauthActions }));
    assert.deepEqual(result.reauthActions, []); assert.equal(result.reauthenticated, false); assert.equal(result.available, false);
  }
  const deleteResult = await readAuthMethods(returns({ ...base, reauthActions: ["delete"] }));
  assert.deepEqual(deleteResult.reauthActions, ["delete"]); assert.equal(deleteResult.reauthenticated, true);
  const result = await readAuthMethods(returns({ ...base, reauthenticated: "true", reauthActions: ["sessions"], available: "true" }));
  assert.equal(result.reauthenticated, false); assert.equal(result.available, false);
  for (const data of [{}, { hasPassword: "true", identities: [] }, { hasPassword: false, identities: null },
    { hasPassword: false, identities: [{ provider: "meta", email: null }] },
    { hasPassword: false, identities: [{ provider: "google", email: 1 }] },
    { hasPassword: false, identities: [{ provider: "google", email: "x".repeat(255) }] },
    { hasPassword: false, identities: [{ provider: "google", email: null }, { provider: "google", email: null }] },
    { hasPassword: false, identities: [null] }]) {
    await assert.rejects(() => readAuthMethods(returns(data)), rejectsCode("OAUTH_RESPONSE_INVALID"));
  }
});

test("pending signup returns only a minimized validated profile, never assumes an invite", async () => {
  assert.deepEqual(await readPendingFederatedProfile(returns({ pending: false, email: "PRIVATE_STALE_PROFILE" })), { pending: false });
  const result = await readPendingFederatedProfile(async (url, init) => {
    assert.equal(url, "/api/auth/oauth/pending"); assert.equal(init?.cache, "no-store");
    return json({ pending: true, provider: "google", email: "pending@example.test", name: "合".repeat(110), hasInvite: "true", subject: "NOT_PUBLIC", token: "NOT_PUBLIC" });
  });
  assert.equal(result.pending, true);
  if (result.pending) { assert.equal(result.name?.length, 100); assert.equal(result.hasInvite, false); }
  assert.equal(JSON.stringify(result).includes("NOT_PUBLIC"), false);
  for (const data of [{}, { pending: "true" }, { pending: true, provider: "meta", email: "a@example.test" },
    { pending: true, provider: "google", email: "not-email" }, { pending: true, provider: "google", email: 123 },
    { pending: true, provider: "google", email: `${"x".repeat(255)}@example.test` }]) {
    await assert.rejects(() => readPendingFederatedProfile(returns(data)), rejectsCode("OAUTH_RESPONSE_INVALID"));
  }
});

test("start sends exact Google action/input once with same-origin no-store and validates canonical authorization URL", async () => {
  let calls = 0;
  const input = { purpose: "link" as const, password: "synthetic-only-password", oauthConsent: true, token: "synthetic-invite" };
  const result = await startFederatedLogin("google", input, async (url, init) => {
    calls++; assert.equal(url, "/api/auth/oauth/google/start"); assert.equal(init?.method, "POST");
    assert.deepEqual(init?.headers, { "Content-Type": "application/json" });
    assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store");
    assert.deepEqual(JSON.parse(String(init?.body)), input); assert.ok(init?.signal instanceof AbortSignal);
    return json({ authorizationUrl: googleUrl, ignored: "NOT_PUBLIC" });
  });
  assert.equal(result, googleUrl); assert.equal(calls, 1);
  assert.equal(await startFederatedLogin("google", { purpose: "login" }, returns({ authorizationUrl: "https://accounts.google.com:443/o/oauth2/v2/auth" })), "https://accounts.google.com/o/oauth2/v2/auth");
});

test("start rejects evil schemes/hosts/paths/ports/userinfo/fragments and never accepts Apple URLs for Google", async () => {
  for (const authorizationUrl of [undefined, 42, "", "/relative", "//accounts.google.com/o/oauth2/v2/auth",
    "http://accounts.google.com/o/oauth2/v2/auth", "javascript:alert(1)", "data:text/html,test",
    "https://evil.example.test/o/oauth2/v2/auth", "https://accounts.google.com.evil.example.test/o/oauth2/v2/auth",
    "https://accounts.google.com@evil.example.test/o/oauth2/v2/auth", "https://user@accounts.google.com/o/oauth2/v2/auth",
    "https://user:password@accounts.google.com/o/oauth2/v2/auth", "https://accounts.google.com:444/o/oauth2/v2/auth",
    "https://accounts.google.com/o/oauth2/v2/auth#unsafe", "https://accounts.google.com/o/oauth2/v2/auth/",
    "https://accounts.google.com/o/oauth2/auth", "https://accounts.google.com/o/oauth2/v2/auth%2Fextra",
    "https://appleid.apple.com/auth/authorize"]) {
    await assert.rejects(() => startFederatedLogin("google", { purpose: "login" }, returns({ authorizationUrl })), rejectsCode("OAUTH_RESPONSE_INVALID"));
  }
});

test("HTTP/network errors expose curated messages only, including unknown backend codes", async () => {
  for (const [status, body, code] of [
    [503, { code: "OAUTH_CONFIGURATION_UNAVAILABLE", error: "PRIVATE_BACKEND_ERROR" }, "OAUTH_CONFIGURATION_UNAVAILABLE"],
    [500, { code: "PRIVATE_UNKNOWN_CODE", error: "PRIVATE_BACKEND_ERROR" }, "PRIVATE_UNKNOWN_CODE"],
    [401, { error: "PRIVATE_BACKEND_ERROR" }, "LOGIN_REQUIRED"],
    [500, { error: "PRIVATE_BACKEND_ERROR" }, "OAUTH_RESPONSE_INVALID"],
  ] as const) {
    await assert.rejects(() => startFederatedLogin("google", { purpose: "login" }, async () => json(body, status)), error => {
      assert.ok(error instanceof OAuthClientError); assert.equal(error.code, code); assert.doesNotMatch(error.message, /PRIVATE/); return true;
    });
  }
  assert.equal(oauthErrorMessage(null), ""); assert.doesNotMatch(oauthErrorMessage("PRIVATE_UNKNOWN_CODE"), /PRIVATE/);
  await assert.rejects(() => startFederatedLogin("google", { purpose: "login" }, async () => { throw Error("PRIVATE_FETCH_ERROR"); }), rejectsCode("OAUTH_NETWORK"));
});

test("429 keeps bounded-header interpretation, overrides backend code, and never auto-retries", async () => {
  for (const [header, expected] of [["5.2", 6], ["60", 60], ["0", undefined], ["-2", undefined], ["Infinity", undefined], ["not-a-number", undefined]] as const) {
    let calls = 0;
    await assert.rejects(() => startFederatedLogin("google", { purpose: "login" }, async () => {
      calls++; return json({ code: "PRIVATE_CODE", error: "PRIVATE_ERROR" }, 429, { "Retry-After": header });
    }), error => {
      assert.ok(error instanceof OAuthClientError); assert.equal(error.code, "RATE_LIMITED"); assert.equal(error.retryAfterSeconds, expected); assert.doesNotMatch(error.message, /PRIVATE/); return true;
    });
    assert.equal(calls, 1);
  }
});

test("cancel requires explicit ok, sends only empty JSON once, and never treats failure as success", async () => {
  let calls = 0;
  await cancelFederatedSignup(async (url, init) => {
    calls++; assert.equal(url, "/api/auth/oauth/cancel"); assert.equal(init?.method, "POST"); assert.equal(init?.body, "{}");
    assert.deepEqual(init?.headers, { "Content-Type": "application/json" }); assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store");
    return json({ ok: true });
  });
  assert.equal(calls, 1);
  for (const data of [{}, { ok: false }, { ok: "true" }, null, []]) await assert.rejects(() => cancelFederatedSignup(returns(data)), rejectsCode("OAUTH_RESPONSE_INVALID"));
  let failures = 0;
  await assert.rejects(() => cancelFederatedSignup(async () => { failures++; throw Error("synthetic transport interrupted"); }), rejectsCode("OAUTH_NETWORK"));
  assert.equal(failures, 1);
  await assert.rejects(() => cancelFederatedSignup(async () => json({ error: "PRIVATE" }, 429, { "Retry-After": "15" })), rejectsCode("RATE_LIMITED"));
});
