import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { build } from "esbuild";
import { createMobileSessionCoordinator, MOBILE_ACCESS_TOKEN_KEY as ACCESS, MOBILE_REFRESH_TOKEN_KEY as REFRESH } from "../mobile-app/src/mobile-session";
import { createSessionEndController } from "../mobile-app/src/session-end-controller";

const root = fileURLToPath(new URL("../", import.meta.url));
let compiled: Promise<string>;
function source() {
  return compiled ??= build({ absWorkingDir: root, entryPoints: ["mobile-app/src/contract.ts"], bundle: true, write: false,
    format: "cjs", platform: "node", target: "node22", plugins: [{ name: "synthetic-native", setup(builder) {
      builder.onResolve({ filter: /^@(?:capacitor|aparajita)\// }, () => ({ path: "native", namespace: "test-stub" }));
      builder.onLoad({ filter: /.*/, namespace: "test-stub" }, () => ({ contents: `const h=globalThis.__nativeTest;
        export const Capacitor={getPlatform:()=>h.platform};
        export const CapacitorHttp={request:o=>h.request(o)};
        export const SecureStorage={getItem:async k=>{h.operations.push('storage:get');return h.storage.get(k)??null},setItem:async(k,v)=>{h.operations.push('storage:set');h.storage.set(k,v)},removeItem:async k=>{h.operations.push('storage:remove');h.storage.delete(k)}};
        export const Browser={open:async()=>{h.operations.push('browser:open')},close:async()=>{h.operations.push('browser:close')},addListener:async()=>{h.operations.push('browser:listener');return {remove:async()=>{}}}};
        export const App={addListener:async()=>{h.operations.push('app:listener');return {remove:async()=>{}}}};`, loader: "js" }));
    } }] }).then(result => result.outputFiles[0].text);
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
async function harness(handler: (options: any) => Promise<any>, platform = "ios") {
  const storage = new Map<string, string>([[ACCESS, "access-A"], [REFRESH, "refresh-A"]]);
  const operations: string[] = [];
  const context = { module: { exports: {} as any }, exports: {}, require: createRequire(import.meta.url), __nativeTest: { storage, request: handler, platform, operations }, URL, setTimeout, clearTimeout, crypto: webcrypto, TextEncoder };
  runInNewContext(await source(), context);
  const create = context.module.exports.createApiClient as (origin: string) => any;
  return { storage, operations, nativeOAuthAvailable: context.module.exports.nativeOAuthAvailable as () => boolean,
    client: create("https://native.example.invalid"), anotherClient: create("https://native.example.invalid") };
}
const pair = (account: string) => ({ accessToken: `access-${account}`, refreshToken: `refresh-${account}` });
const response = (status: number, data: unknown = {}) => ({ status, data });

test("provider discovery is public, credential-free and keeps password sessions unchanged", async () => {
  const h = await harness(async options => {
    assert.equal(options.method, "GET"); assert.ok(options.url.endsWith("/api/mobile/auth/providers"));
    assert.equal(options.headers.Authorization, undefined);
    return response(200, { protocolVersion: 2, providers: [{ id: "google", enabled: true }, { id: "apple", enabled: false }] });
  });
  assert.equal(JSON.stringify(await h.client.getOAuthProviders()), '["google"]');
  assert.deepEqual(h.operations, []); assert.equal(h.storage.get(ACCESS), "access-A"); assert.equal(h.storage.get(REFRESH), "refresh-A");
});

test("legacy discovery and Android cannot expose unsupported native provider controls", async () => {
  const legacy = await harness(async () => response(404));
  assert.equal(JSON.stringify(await legacy.client.getOAuthProviders()), "[]"); assert.deepEqual(legacy.operations, []);
  const android = await harness(async () => { throw Error("ANDROID_MUST_NOT_REQUEST_PROVIDERS"); }, "android");
  assert.equal(JSON.stringify(await android.client.getOAuthProviders()), "[]"); assert.deepEqual(android.operations, []);
});

test("unavailable or malformed discovery is retryable uncertainty, never sign-out or enabled providers", async () => {
  for (const result of [response(503), response(200, { providers: [] }), response(200, { protocolVersion: 2, providers: [{ id: "google", enabled: true }, { id: "google", enabled: false }] })]) {
    const h = await harness(async () => result);
    await assert.rejects(h.client.getOAuthProviders()); assert.deepEqual(h.operations, []); assert.equal(h.storage.get(ACCESS), "access-A");
  }
});

function sessionCleanup(client: any, stopPush: () => Promise<{ serverConfirmed: boolean; nativeConfirmed: boolean }>) {
  const events: string[] = [];
  const controller = createSessionEndController({
    stopPush, endSession: () => client.logout(), errorGuard: error => (error as any)?.isCurrentSession,
    onStart: () => { events.push("private-hidden"); },
    onComplete: () => { events.push("signed-out"); },
    onUnconfirmed: () => { events.push("offline-hidden"); },
    onOwnershipLost: () => { events.push("reload-current-identity"); },
    onSettled: () => { events.push("settled"); },
  });
  let recovery: Promise<void> | undefined;
  const unsubscribe = client.onSessionInvalidated((guard: () => boolean) => { recovery = controller.request(guard); });
  return { events, controller, unsubscribe, recovery: () => recovery };
}

test("global revocation supersedes an in-flight logout even after its account page has gone", async () => {
  const h = await harness(async () => response(200, { ok: true, currentSessionRetained: false }));
  const push = deferred<{ serverConfirmed: boolean; nativeConfirmed: boolean }>();
  const cleanup = sessionCleanup(h.client, () => push.promise);
  const originalLogout = cleanup.controller.request(h.client.captureSessionGuard());
  assert.deepEqual(cleanup.events, ["private-hidden"]);
  await h.anotherClient.revokeOtherSessions("synthetic-password");
  assert.equal(cleanup.recovery(), originalLogout);
  push.resolve({ serverConfirmed: false, nativeConfirmed: true });
  await originalLogout;
  assert.equal(h.storage.size, 0);
  assert.deepEqual(cleanup.events, ["private-hidden", "signed-out", "settled"]);
  cleanup.unsubscribe();
});

test("queued expired-session cleanup cannot log out a replacement account", async () => {
  const h = await harness(async options => options.url.endsWith("/auth/login")
    ? response(200, pair("B")) : response(200, { ok: true, currentSessionRetained: false }));
  const push = deferred<{ serverConfirmed: boolean; nativeConfirmed: boolean }>();
  const cleanup = sessionCleanup(h.client, () => push.promise);
  await h.anotherClient.revokeOtherSessions("synthetic-password");
  const recovery = cleanup.recovery(); assert.ok(recovery);
  await h.anotherClient.login("B@example.invalid", "synthetic-password");
  push.resolve({ serverConfirmed: false, nativeConfirmed: false });
  await recovery;
  assert.equal(h.storage.get(ACCESS), "access-B"); assert.equal(h.storage.get(REFRESH), "refresh-B");
  assert.deepEqual(cleanup.events, ["private-hidden", "reload-current-identity", "settled"]);
  cleanup.unsubscribe();
});

test("old cleanup only hides content while a replacement login is still writing its new pair", async () => {
  const loginStarted = deferred<void>(), loginResponse = deferred<any>();
  const h = await harness(async options => {
    assert.ok(options.url.endsWith("/auth/login")); loginStarted.resolve(); return loginResponse.promise;
  });
  const push = deferred<{ serverConfirmed: boolean; nativeConfirmed: boolean }>();
  const cleanup = sessionCleanup(h.client, () => push.promise);
  const logout = cleanup.controller.request(h.client.captureSessionGuard());
  const login = h.anotherClient.login("B@example.invalid", "synthetic-password");
  await loginStarted.promise;
  push.resolve({ serverConfirmed: false, nativeConfirmed: true }); await logout;
  assert.deepEqual(cleanup.events, ["private-hidden", "reload-current-identity", "settled"]);
  loginResponse.resolve(response(200, pair("B"))); await login;
  assert.equal(h.storage.get(ACCESS), "access-B"); assert.equal(h.storage.get(REFRESH), "refresh-B");
  cleanup.unsubscribe();
  const app = readFileSync(new URL("../mobile-app/src/App.tsx", import.meta.url), "utf8");
  const lost = app.slice(app.indexOf("onOwnershipLost:"), app.indexOf("onSettled:"));
  assert.doesNotMatch(lost, /loadMe\(|api\.me\(/);
  assert.match(lost, /setMember\(null\); setPhase\("offline"\)/);
});

test("confirmed revocation with unavailable keychain hides data once and never loops cleanup", async () => {
  const h = await harness(async () => response(200, { ok: true, currentSessionRetained: false }));
  h.storage.delete = () => { throw Error("synthetic keychain unavailable"); };
  let pushAttempts = 0;
  const cleanup = sessionCleanup(h.client, async () => { pushAttempts++; return { serverConfirmed: false, nativeConfirmed: true }; });
  await assert.rejects(h.client.revokeOtherSessions("synthetic-password"));
  await cleanup.recovery();
  assert.equal(pushAttempts, 1);
  assert.deepEqual(cleanup.events, ["private-hidden", "offline-hidden", "settled"]);
  cleanup.unsubscribe();
});

test("a protected retry explicitly rejecting the refreshed session notifies global recovery", async () => {
  let refreshes = 0, invalidations = 0;
  const h = await harness(async options => {
    if (options.url.endsWith("/auth/refresh")) { refreshes++; return response(200, pair("renewed")); }
    return response(401, { error: "未登入或登入已過期" });
  });
  const unsubscribe = h.client.onSessionInvalidated(() => { invalidations++; });
  await assert.rejects(h.client.getBlockedMembers(), { code: "UNAUTHENTICATED", status: 401 });
  assert.equal(refreshes, 1); assert.equal(invalidations, 1); assert.equal(h.storage.size, 0);
  unsubscribe();
});

test("a reauthentication password refusal after refresh never expires the current account", async () => {
  let invalidations = 0;
  const h = await harness(async options => options.url.endsWith("/auth/refresh")
    ? response(200, pair("renewed")) : response(401, { error: "密碼不正確", code: "REAUTH_REQUIRED" }));
  const unsubscribe = h.client.onSessionInvalidated(() => { invalidations++; });
  await assert.rejects(h.client.revokeOtherSessions("synthetic-incorrect-password"));
  assert.equal(invalidations, 0); assert.equal(h.storage.get(ACCESS), "access-renewed");
  unsubscribe();
});

test("Android direct Google/Apple calls fail before network, browser, listeners or secure-storage changes", async () => {
  let requests = 0;
  const h = await harness(async () => { requests++; throw Error("Unexpected Android OAuth request"); }, "android");
  assert.equal(h.nativeOAuthAvailable(), false);
  for (const provider of ["google", "apple"] as const) await assert.rejects(h.client.loginWithProvider(provider), {
    code: "PROVIDER_DISABLED", status: 503, message: "第三方登入尚未開放，請使用會員信箱與密碼登入。",
  });
  assert.equal(requests, 0); assert.deepEqual(h.operations, []);
  assert.equal(h.storage.get(ACCESS), "access-A"); assert.equal(h.storage.get(REFRESH), "refresh-A");
});
test("Android OAuth refusal cannot supersede an existing session or a pending authenticated response", async () => {
  const started = deferred<void>(), late = deferred<any>();
  const h = await harness(async options => {
    assert.ok(options.url.endsWith("/mobile/me")); started.resolve(); return late.promise;
  }, "android");
  const me = h.client.me(); await started.promise;
  await assert.rejects(h.client.loginWithProvider("google"), { code: "PROVIDER_DISABLED" });
  late.resolve(response(200, { id: "synthetic-A" }));
  assert.equal((await me).id, "synthetic-A"); assert.equal(h.storage.get(ACCESS), "access-A");
});
test("iOS keeps the existing provider-start behavior; the Android gate does not claim iOS OAuth acceptance", async () => {
  const requests: string[] = [];
  const h = await harness(async options => { requests.push(options.url); return response(503, { error: "synthetic provider not configured" }); }, "ios");
  assert.equal(h.nativeOAuthAvailable(), true);
  await assert.rejects(h.client.loginWithProvider("apple"), { message: "synthetic provider not configured" });
  assert.deepEqual(requests, ["https://native.example.invalid/api/mobile/auth/oauth/apple/start"]);
  assert.ok(h.operations.includes("storage:remove"));
  assert.equal(h.operations.includes("browser:open"), false);
});

test("notification read acknowledgement requires an explicit bounded successful count", async () => {
  for (const data of [{ ok: true, updatedCount: 0 }, { ok: true, updatedCount: 1 }, { ok: true, updatedCount: 2 }]) {
    const h = await harness(async () => response(200, data));
    await h.client.markNotificationsRead(["synthetic-one", "synthetic-two", "synthetic-two"]);
  }
  for (const data of [{}, null, { ok: false, updatedCount: 1 }, { ok: true }, { ok: true, updatedCount: "1" },
    { ok: true, updatedCount: -1 }, { ok: true, updatedCount: 0.5 }, { ok: true, updatedCount: 3 }]) {
    const h = await harness(async () => response(200, data));
    await assert.rejects(h.client.markNotificationsRead(["synthetic-one", "synthetic-two", "synthetic-two"]), { message: "通知已讀狀態尚未確認，請重新讀取後再試。" });
  }
});

test("screen guards are shared across clients, survive same-account refresh, and expire on replacement login", async () => {
  const h = await harness(async options => {
    if (options.url.endsWith("/auth/login")) return response(200, pair("B"));
    if (options.url.endsWith("/auth/refresh")) return response(200, pair("new"));
    if (options.headers.Authorization !== "Bearer access-new") return response(401);
    return response(200, { enabled: false, privacyMode: "generic" });
  });
  const current = h.client.captureSessionGuard(); assert.equal(typeof current, "function"); assert.equal(current(), true);
  await h.client.getPushConfig(); assert.equal(current(), true);
  await h.anotherClient.login("B@example.invalid", "synthetic"); assert.equal(current(), false);
  assert.equal(h.client.captureSessionGuard()(), true);
});

test("malformed block lists become read failures while a genuine empty list remains valid", async () => {
  for (const blocks of [undefined, null, {}, "wrong", [null], [{ member: null, createdAt: "2026-11-08T00:00:00Z" }],
    [{ member: { id: "synthetic", name: {} }, createdAt: "2026-11-08T00:00:00Z" }]]) {
    const h = await harness(async () => response(200, { blocks }));
    await assert.rejects(h.client.getBlockedMembers(), { message: "封鎖名單格式尚未確認，請重新讀取；不代表沒有封鎖會員。" });
  }
  const valid = await harness(async () => response(200, { blocks: [] }));
  assert.equal(JSON.stringify(await valid.client.getBlockedMembers()), "[]");
  const compatible = await harness(async () => response(200, { blocks: [{ member: { id: "synthetic", name: "合成會員", ignored: {} }, createdAt: "2026-11-08T00:00:00Z" }] }));
  assert.deepEqual(JSON.parse(JSON.stringify(await compatible.client.getBlockedMembers())), [{ member: { id: "synthetic", name: "合成會員", nickname: null, photoUrl: null }, createdAt: "2026-11-08T00:00:00Z" }]);
});

test("HTTP 200 alone cannot claim verification requested, blocking or unblocking success", async () => {
  for (const data of [{}, null, { ok: false }, { ok: "true" }]) {
    const h = await harness(async () => response(200, data));
    for (const method of ["resendVerificationEmail", "blockMember", "unblockMember"]) await assert.rejects(h.client[method]("synthetic-member"));
  }
  const h = await harness(async () => response(200, { ok: true }));
  await h.client.resendVerificationEmail(); await h.client.blockMember("synthetic-member"); await h.client.unblockMember("synthetic-member");
});

test("retained-session acknowledgement needs a complete pair and never renders an unchecked server message", async () => {
  const h = await harness(async () => response(200, { ok: true, currentSessionRetained: true, ...pair("renewed"), message: { malformed: true } }));
  const result = await h.client.revokeOtherSessions("synthetic-password");
  assert.equal(result.currentSessionRetained, true); assert.equal(result.message, "其他裝置已登出，此裝置繼續使用");
  assert.equal(h.storage.get(ACCESS), "access-renewed"); assert.equal(h.storage.get(REFRESH), "refresh-renewed"); assert.equal(result.isCurrent(), true);
  for (const data of [{}, { ok: false, currentSessionRetained: true }, { ok: true, currentSessionRetained: "true" },
    { ok: true, currentSessionRetained: true }, { ok: true, currentSessionRetained: true, accessToken: "only-one" },
    { ok: true, currentSessionRetained: false, ...pair("contradictory") }]) {
    const invalid = await harness(async () => response(200, data));
    await assert.rejects(invalid.client.revokeOtherSessions("synthetic-password"), { message: "登出結果尚未確認，請重新確認登入狀態；不會自動重送。" });
    assert.equal(invalid.storage.get(ACCESS), "access-A"); assert.equal(invalid.storage.get(REFRESH), "refresh-A");
  }
});

test("confirmed loss of this session clears its credentials and its UI result cannot target a later account", async () => {
  const h = await harness(async options => options.url.endsWith("/auth/login") ? response(200, pair("B")) : response(200, { ok: true, currentSessionRetained: false }));
  const result = await h.client.revokeOtherSessions("synthetic-password");
  assert.equal(result.currentSessionRetained, false); assert.equal(h.storage.size, 0); assert.equal(result.isCurrent(), true);
  await h.anotherClient.login("B@example.invalid", "synthetic"); assert.equal(result.isCurrent(), false);
  assert.equal(h.storage.get(ACCESS), "access-B");
});

for (const method of ["logout", "revokeOtherSessions"] as const) test(`${method} storage-clear failure retains its exact recovery guard without targeting a replacement account`, async () => {
  const h = await harness(async options => options.url.endsWith("/auth/login") ? response(200, pair("B")) : response(200, { ok: true, currentSessionRetained: false }));
  const before = h.client.captureSessionGuard(), remove = h.storage.delete.bind(h.storage);
  h.storage.delete = () => { throw Error("synthetic keychain unavailable"); };
  let failure: any;
  try { await h.client[method]("synthetic-password"); } catch (error) { failure = error; }
  assert.ok(failure); assert.equal(before(), false); assert.equal(failure.isCurrentSession(), true);
  assert.equal(h.storage.size, 2);
  h.storage.delete = remove;
  await h.anotherClient.login("B@example.invalid", "synthetic");
  assert.equal(failure.isCurrentSession(), false); assert.equal(h.storage.get(ACCESS), "access-B");
});

test("failed credential rotation after confirmed revocation exposes recovery and never retains a partial token pair", async () => {
  const h = await harness(async options => options.url.endsWith("/auth/login") ? response(200, pair("B")) : response(200, { ok: true, currentSessionRetained: true, ...pair("renewed") }));
  const write = h.storage.set.bind(h.storage);
  h.storage.set = (key, value) => { if (key === REFRESH) throw Error("synthetic refresh write failure"); return write(key, value); };
  let failure: any;
  try { await h.client.revokeOtherSessions("synthetic-password"); } catch (error) { failure = error; }
  assert.match(failure.message, /登入更新尚未保存/); assert.equal(failure.isCurrentSession(), true); assert.equal(h.storage.size, 0);
  h.storage.set = write;
  await h.anotherClient.login("B@example.invalid", "synthetic"); assert.equal(failure.isCurrentSession(), false);
});

test("confirmed refresh rejection notifies the App even when the requesting screen is gone", async () => {
  const h = await harness(async () => response(401));
  const invalidated: Array<() => boolean> = [];
  const unsubscribe = h.anotherClient.onSessionInvalidated((guard: () => boolean) => invalidated.push(guard));
  await assert.rejects(h.client.getBlockedMembers(), { code: "UNAUTHENTICATED" });
  assert.equal(h.storage.size, 0); assert.equal(invalidated.length, 1); assert.equal(invalidated[0](), true);
  unsubscribe();
});

test("a confirmed revoke or storage failure notifies the global subscriber without a mounted settings page", async () => {
  for (const failure of [false, true]) {
    const h = await harness(async () => response(200, { ok: true, currentSessionRetained: false }));
    const invalidated: Array<() => boolean> = [];
    h.client.onSessionInvalidated((guard: () => boolean) => invalidated.push(guard));
    if (failure) h.storage.delete = () => { throw Error("synthetic keychain unavailable"); };
    if (failure) await assert.rejects(h.client.revokeOtherSessions("synthetic")); else await h.client.revokeOtherSessions("synthetic");
    assert.equal(invalidated.length, 1); assert.equal(invalidated[0](), true);
  }
});

test("unknown refresh failures and stale account-A replies never publish a recovery that targets B", async () => {
  for (const status of [500, 503]) {
    const h = await harness(async options => response(options.url.endsWith("/auth/refresh") ? status : 401));
    let invalidations = 0; h.client.onSessionInvalidated(() => invalidations++);
    await assert.rejects(h.client.getPushConfig()); assert.equal(invalidations, 0); assert.equal(h.storage.get(ACCESS), "access-A");
  }
  const started = deferred<void>(), late = deferred<any>();
  const h = await harness(async options => {
    if (options.url.endsWith("/auth/login")) return response(200, pair("B"));
    if (options.url.endsWith("/auth/refresh")) { started.resolve(); return late.promise; }
    return response(401);
  });
  let invalidations = 0; h.client.onSessionInvalidated(() => invalidations++);
  const old = h.client.getPushConfig(), rejected = assert.rejects(old);
  await started.promise; await h.anotherClient.login("B@example.invalid", "synthetic"); late.resolve(response(401)); await rejected;
  assert.equal(invalidations, 0); assert.equal(h.storage.get(ACCESS), "access-B");
});

for (const lateStatus of [200, 401]) test(`late account-A refresh ${lateStatus} cannot overwrite or clear account B after logout`, async () => {
  const started = deferred<void>(), late = deferred<any>();
  const h = await harness(async options => {
    if (options.url.endsWith("/push/config")) return response(401);
    if (options.url.endsWith("/auth/refresh")) { started.resolve(); return late.promise; }
    if (options.url.endsWith("/auth/login")) return response(200, pair("B"));
    return response(200);
  });
  const old = h.client.getPushConfig(); const rejection = assert.rejects(old);
  await started.promise; await h.anotherClient.logout(); await h.anotherClient.login("B@example.invalid", "synthetic");
  late.resolve(response(lateStatus, pair("A-late"))); await rejection;
  assert.equal(h.storage.get(ACCESS), "access-B"); assert.equal(h.storage.get(REFRESH), "refresh-B");
});
test("parallel refresh across different API client objects is single-flight and stays in the same account", async () => {
  const started = deferred<void>(), late = deferred<any>(); let refreshes = 0;
  const h = await harness(async options => {
    if (options.url.endsWith("/auth/refresh")) { refreshes++; started.resolve(); return late.promise; }
    if (options.headers.Authorization !== "Bearer access-new") return response(401);
    return response(200, options.url.endsWith("/push/config") ? { enabled: false, privacyMode: "generic" } : { id: "synthetic-A" });
  });
  const a = h.client.getPushConfig(), b = h.anotherClient.me();
  await started.promise; await new Promise(resolve => setImmediate(resolve)); late.resolve(response(200, pair("new")));
  await Promise.all([a, b]); assert.equal(refreshes, 1); assert.equal(h.storage.get(ACCESS), "access-new");
});
test("a late mutation response cannot retry the old action using a new account's tokens", async () => {
  const started = deferred<void>(), late = deferred<any>(); const actors: string[] = [];
  const h = await harness(async options => {
    if (options.url.endsWith("/friends/request")) { actors.push(options.headers.Authorization); started.resolve(); return late.promise; }
    if (options.url.endsWith("/auth/login")) return response(200, pair("B"));
    throw Error("unexpected retry or refresh");
  });
  const old = h.client.requestFriend("synthetic-target"); const rejected = assert.rejects(old);
  await started.promise; await h.anotherClient.login("B@example.invalid", "synthetic"); late.resolve(response(401)); await rejected;
  assert.deepEqual(actors, ["Bearer access-A"]); assert.equal(h.storage.get(ACCESS), "access-B");
});
for (const failure of ["network", "server"]) test(`unknown ${failure} refresh failure preserves the current token pair`, async () => {
  const h = await harness(async options => {
    if (options.url.endsWith("/auth/refresh")) { if (failure === "network") throw Error("synthetic offline"); return response(503); }
    return response(401);
  });
  await assert.rejects(h.client.getPushConfig()); assert.equal(h.storage.get(ACCESS), "access-A"); assert.equal(h.storage.get(REFRESH), "refresh-A");
});
test("serialized storage fencing waits for an old partial write before clearing and writing a replacement", async () => {
  const started = deferred<void>(), release = deferred<void>(); const data = new Map<string, string>();
  const session = createMobileSessionCoordinator({
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) { if (value === "access-old") { started.resolve(); await release.promise; } data.set(key, value); },
    async removeItem(key) { data.delete(key); },
  });
  const oldEpoch = session.beginChange(); const old = session.writePair(oldEpoch, pair("old")); const rejected = assert.rejects(old);
  await started.promise; const next = session.beginChange(); const clear = session.clear(next); const replacement = session.writePair(next, pair("B"));
  release.resolve(); await Promise.all([rejected, clear, replacement]); assert.equal(data.get(ACCESS), "access-B"); assert.equal(data.get(REFRESH), "refresh-B");
});
