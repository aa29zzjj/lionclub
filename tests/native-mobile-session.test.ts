import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { createMobileSessionCoordinator, MOBILE_ACCESS_TOKEN_KEY as ACCESS, MOBILE_REFRESH_TOKEN_KEY as REFRESH } from "../mobile-app/src/mobile-session";

const root = fileURLToPath(new URL("../", import.meta.url));
let compiled: Promise<string>;
function source() {
  return compiled ??= build({ absWorkingDir: root, entryPoints: ["mobile-app/src/contract.ts"], bundle: true, write: false,
    format: "cjs", platform: "node", target: "node22", plugins: [{ name: "synthetic-native", setup(builder) {
      builder.onResolve({ filter: /^@(?:capacitor|aparajita)\// }, () => ({ path: "native", namespace: "test-stub" }));
      builder.onLoad({ filter: /.*/, namespace: "test-stub" }, () => ({ contents: `const h=globalThis.__nativeTest;
        export const CapacitorHttp={request:o=>h.request(o)};
        export const SecureStorage={getItem:async k=>h.storage.get(k)??null,setItem:async(k,v)=>{h.storage.set(k,v)},removeItem:async k=>{h.storage.delete(k)}};
        export const Browser={open:async()=>{},close:async()=>{},addListener:async()=>({remove:async()=>{}})};
        export const App={addListener:async()=>({remove:async()=>{}})};`, loader: "js" }));
    } }] }).then(result => result.outputFiles[0].text);
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
async function harness(handler: (options: any) => Promise<any>) {
  const storage = new Map<string, string>([[ACCESS, "access-A"], [REFRESH, "refresh-A"]]);
  const context = { module: { exports: {} as any }, exports: {}, require: createRequire(import.meta.url), __nativeTest: { storage, request: handler }, URL, setTimeout, clearTimeout };
  runInNewContext(await source(), context);
  const create = context.module.exports.createApiClient as (origin: string) => any;
  return { storage, client: create("https://native.example.invalid"), anotherClient: create("https://native.example.invalid") };
}
const pair = (account: string) => ({ accessToken: `access-${account}`, refreshToken: `refresh-${account}` });
const response = (status: number, data: unknown = {}) => ({ status, data });

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
