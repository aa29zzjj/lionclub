import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { TERMS_VERSION } from "../src/lib/terms";
import { MOBILE_ACCESS_TOKEN_KEY as ACCESS, MOBILE_REFRESH_TOKEN_KEY as REFRESH } from "../mobile-app/src/mobile-session";

let compiled: Promise<string>;
function source() {
  return compiled ??= build({ absWorkingDir: fileURLToPath(new URL("../", import.meta.url)), entryPoints: ["mobile-app/src/contract.ts"],
    bundle: true, write: false, format: "cjs", platform: "node", target: "node22", plugins: [{ name: "synthetic-native-terms", setup(builder) {
      builder.onResolve({ filter: /^@(?:capacitor|aparajita)\// }, () => ({ path: "native", namespace: "test-stub" }));
      builder.onLoad({ filter: /.*/, namespace: "test-stub" }, () => ({ contents: `const h=globalThis.__termsTest;
        export const Capacitor={getPlatform:()=>"ios"}; export const CapacitorHttp={request:o=>h.request(o)};
        export const SecureStorage={getItem:async k=>h.storage.get(k)??null,setItem:async(k,v)=>h.storage.set(k,v),removeItem:async k=>h.storage.delete(k)};
        export const Browser={open:async()=>{throw Error("Unexpected Browser open")},close:async()=>{},addListener:async()=>({remove:async()=>{}})};
        export const App={addListener:async()=>({remove:async()=>{}})};`, loader: "js" }));
    } }] }).then(result => result.outputFiles[0].text);
}
async function harness(request: (options: any) => Promise<any>) {
  const storage = new Map([[ACCESS, "synthetic-access-A"], [REFRESH, "synthetic-refresh-A"]]);
  const context = { module: { exports: {} as any }, exports: {}, require: createRequire(import.meta.url), __termsTest: { request, storage }, URL, setTimeout, clearTimeout, TextEncoder };
  runInNewContext(await source(), context);
  return { client: context.module.exports.createApiClient("https://native.example.invalid"), storage };
}
const status = (accepted = false) => ({ termsVersion: TERMS_VERSION, accepted, termsAcceptedAt: accepted ? "2026-11-08T01:00:00.000Z" : null });
const response = (data: unknown, status = 200) => ({ status, data });

test("native terms status uses Bearer auth and inherits only exact-version timestamped consent", async () => {
  for (const accepted of [false, true]) {
    const h = await harness(async options => {
      assert.equal(options.url, "https://native.example.invalid/api/mobile/me/terms-consent");
      assert.equal(options.method, "GET"); assert.equal(options.headers.Authorization, "Bearer synthetic-access-A");
      return response(status(accepted));
    });
    assert.deepEqual(JSON.parse(JSON.stringify(await h.client.getTermsConsent())), status(accepted));
  }
});
test("unknown, old-version or incomplete status never counts as accepted", async () => {
  for (const data of [null, {}, { ...status(true), termsVersion: "2020-01-01" }, { ...status(true), termsAcceptedAt: null },
    { ...status(true), termsAcceptedAt: "not-a-date" }, { ...status(true), termsAcceptedAt: "0" }, { ...status(true), termsAcceptedAt: "2026-02-30T01:00:00.000Z" },
    { ...status(), termsAcceptedAt: "2026-11-08T01:00:00.000Z" }, { ...status(true), accepted: "true" }]) {
    const h = await harness(async () => response(data)); await assert.rejects(h.client.getTermsConsent());
  }
});
test("native acceptance sends explicit true plus the displayed current version and requires a full acknowledgement", async () => {
  const h = await harness(async options => {
    assert.equal(options.method, "POST"); assert.equal(options.headers.Authorization, "Bearer synthetic-access-A");
    assert.deepEqual(JSON.parse(JSON.stringify(options.data)), { accept: true, termsVersion: TERMS_VERSION });
    return response({ ok: true, ...status(true) });
  });
  assert.equal((await h.client.acceptTerms(TERMS_VERSION)).accepted, true);
});
test("old displayed version is refused before any request", async () => {
  let calls = 0; const h = await harness(async () => { calls++; return response({ ok: true, ...status(true) }); });
  await assert.rejects(h.client.acceptTerms("2020-01-01")); assert.equal(calls, 0);
});
test("HTTP 200 without explicit exact-version accepted evidence cannot acknowledge consent", async () => {
  for (const data of [{}, null, status(true), { ok: false, ...status(true) }, { ok: true, ...status() },
    { ok: true, ...status(true), termsVersion: "2020-01-01" }, { ok: true, ...status(true), termsAcceptedAt: null }]) {
    const h = await harness(async () => response(data)); await assert.rejects(h.client.acceptTerms(TERMS_VERSION));
  }
});
test("API unavailable or network failure does not turn either consent operation into success", async () => {
  for (const handler of [async () => response({ ok: true, ...status(true) }, 404), async () => response({ ok: true, ...status(true) }, 503),
    async () => { throw Error("synthetic offline"); }]) {
    const h = await harness(handler); await assert.rejects(h.client.getTermsConsent()); await assert.rejects(h.client.acceptTerms(TERMS_VERSION));
  }
});
test("late acceptance cannot update a new account's local consent state", async () => {
  let start!: () => void, finish!: (value: unknown) => void;
  const started = new Promise<void>(resolve => { start = resolve; }), pending = new Promise(resolve => { finish = resolve; });
  const h = await harness(async options => {
    if (options.url.endsWith("/terms-consent")) { start(); return pending; }
    if (options.url.endsWith("/auth/login")) return response({ accessToken: "synthetic-access-B", refreshToken: "synthetic-refresh-B" });
    throw Error("Unexpected call");
  });
  const accepted = h.client.acceptTerms(TERMS_VERSION); const rejected = assert.rejects(accepted, { code: "UNAUTHENTICATED" });
  await started; await h.client.login("B@example.invalid", "synthetic"); finish(response({ ok: true, ...status(true) })); await rejected;
  assert.equal(h.storage.get(ACCESS), "synthetic-access-B");
});
test("an activity terms gate is a distinguishable native error and does not automatically consent or resubmit", async () => {
  let calls = 0;
  const h = await harness(async options => {
    calls++; assert.equal(options.url, "https://native.example.invalid/api/mobile/events");
    return response({ code: "TERMS_REQUIRED" }, 403);
  });
  await assert.rejects(h.client.createEvent({ title: "合成活動", startAt: "2026-12-01T01:00:00.000Z", location: "合成會址" }), { code: "TERMS_REQUIRED", status: 403 });
  assert.equal(calls, 1);
});
