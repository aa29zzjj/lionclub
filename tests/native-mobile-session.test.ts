import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { build } from "esbuild";
import { createMobileSessionCoordinator, MOBILE_ACCESS_TOKEN_KEY as ACCESS, MOBILE_REFRESH_TOKEN_KEY as REFRESH } from "../mobile-app/src/mobile-session";

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

test("Android login UI gates both third-party buttons and uses plain unavailable copy", () => {
  const app = readFileSync(new URL("../mobile-app/src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /const oauthAvailable = nativeOAuthAvailable\(\)/);
  assert.match(app, /\{oauthAvailable \? <div className="oauth-block">[\s\S]*?handleOAuthLogin\("google"\)[\s\S]*?handleOAuthLogin\("apple"\)[\s\S]*?<\/div> : <p[^>]*>第三方登入尚未開放，請使用會員信箱與密碼登入。<\/p>\}/);
  assert.match(app, /async function handleOAuthLogin[^]*?if \(!oauthAvailable\) \{[^]*?return; \}[^]*?loadGeneration\.current\+\+/);
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
