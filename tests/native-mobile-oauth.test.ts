import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { createHash, webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { NATIVE_OAUTH_REDIRECT_URI as callback, NATIVE_OAUTH_PROTOCOL_VERSION, createNativeOAuthAttempt, nativeOAuthErrorMessage, readNativeOAuthBootstrap, readNativeOAuthCallback, waitForNativeOAuth } from "../mobile-app/src/native-oauth";

type Options = Parameters<typeof waitForNativeOAuth>[0];
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const state = "s".repeat(43), code = "c".repeat(43), otherState = "t".repeat(43);
const boundQuery = (query: string, boundState = state) => `state=${boundState}&protocolVersion=2${query ? `&${query}` : ""}`;
const callbackUrl = (query = `code=${code}`, boundState = state) => `${callback}?${boundQuery(query, boundState)}`;
const apiBase = "https://native.example.invalid";
const bootstrapUrl = `${apiBase}/api/mobile/auth/oauth/bootstrap?token=synthetic-bootstrap-token`;
const bootstrap = (overrides: Record<string, unknown> = {}) => ({ protocolVersion: 2, state, bootstrapUrl, ...overrides });

test("v2 attempts draw two independent 32-byte secure values and derive S256 with an independent SHA-256 implementation", async () => {
  const draws: Uint8Array[] = [];
  const random = {
    getRandomValues(bytes: Uint8Array) {
      assert.equal(bytes.byteLength, 32);
      bytes.set(Array.from({ length: 32 }, (_, index) => index + (draws.length ? 65 : 1)));
      draws.push(bytes.slice()); return bytes;
    },
    subtle: webcrypto.subtle,
  } as unknown as Crypto;
  const attempt = await createNativeOAuthAttempt(random);
  assert.equal(NATIVE_OAUTH_PROTOCOL_VERSION, 2);
  assert.equal(draws.length, 2);
  assert.equal(attempt.state, Buffer.from(draws[0]).toString("base64url"));
  assert.equal(attempt.codeVerifier, Buffer.from(draws[1]).toString("base64url"));
  assert.notEqual(attempt.state, attempt.codeVerifier);
  assert.equal(attempt.codeChallenge, createHash("sha256").update(attempt.codeVerifier, "ascii").digest("base64url"));
  for (const value of Object.values(attempt)) assert.match(value, /^[A-Za-z0-9_-]{43}$/);
});

test("actual Web Crypto attempts are fresh and S256 does not expose the verifier", async () => {
  const first = await createNativeOAuthAttempt(webcrypto as unknown as Crypto);
  const second = await createNativeOAuthAttempt(webcrypto as unknown as Crypto);
  assert.notEqual(first.state, second.state); assert.notEqual(first.codeVerifier, second.codeVerifier);
  for (const attempt of [first, second]) {
    for (const value of Object.values(attempt)) assert.match(value, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(attempt.codeVerifier, attempt.codeChallenge);
    assert.equal(attempt.codeChallenge, createHash("sha256").update(attempt.codeVerifier, "ascii").digest("base64url"));
  }
});

test("missing or failed secure randomness/digest refuses an attempt without an insecure fallback", async () => {
  for (const crypto of [{}, { getRandomValues() {} }, { subtle: webcrypto.subtle },
    { getRandomValues() { throw Error("synthetic random unavailable"); }, subtle: webcrypto.subtle },
    { getRandomValues: (bytes: Uint8Array) => bytes, subtle: { digest() { throw Error("synthetic digest unavailable"); } } },
  ]) await assert.rejects(createNativeOAuthAttempt(crypto as unknown as Crypto));
});

function harness(overrides: Partial<Options> = {}) {
  let urlCallback!: (value: string) => void, closeCallback!: () => void;
  let current = true;
  const operations: string[] = [];
  const opened = deferred<void>();
  const options: Options = {
    state,
    async listenForUrl(cb) { operations.push("listen:url"); urlCallback = cb; return { async remove() { operations.push("remove:url"); } }; },
    async listenForClose(cb) { operations.push("listen:close"); closeCallback = cb; return { async remove() { operations.push("remove:close"); } }; },
    async openBrowser() { operations.push("open"); opened.resolve(); },
    async closeBrowser() { operations.push("close"); },
    isCurrent: () => current,
    timeoutMs: 1000,
    ...overrides,
  };
  return { operations, opened: opened.promise, run: () => waitForNativeOAuth(options),
    emitUrl: (value: string) => urlCallback(value), emitClose: () => closeCallback(), supersede: () => { current = false; } };
}

test("native OAuth callback accepts only an exact v2 code/error target bound to its attempt", () => {
  assert.deepEqual(readNativeOAuthCallback(callbackUrl(), state), { code });
  assert.deepEqual(readNativeOAuthCallback(callbackUrl("error=OAUTH_CANCELLED"), state), { error: "OAUTH_CANCELLED" });
});

for (const url of [
  "not a URL", `https://oauth-callback?${boundQuery(`code=${code}`)}`, `${callback}.invalid?${boundQuery(`code=${code}`)}`,
  `${callback}/another-path?${boundQuery(`code=${code}`)}`, `${callback}:443?${boundQuery(`code=${code}`)}`,
  `com.lionclubsmembership.app://other@oauth-callback?${boundQuery(`code=${code}`)}`, `${callbackUrl()}#fragment`,
]) test(`ignores a callback with a different or malformed target: ${url}`, () => {
  assert.equal(readNativeOAuthCallback(url, state), null);
});

for (const [label, query] of [
  ["legacy code-only", `code=${code}`], ["missing state", `protocolVersion=2&code=${code}`],
  ["wrong state", boundQuery(`code=${code}`, otherState)],
  ["duplicate same state", `${boundQuery(`code=${code}`)}&state=${state}`],
  ["duplicate different state", `${boundQuery(`code=${code}`)}&state=${otherState}`],
  ["missing version", `state=${state}&code=${code}`], ["old version", `state=${state}&protocolVersion=1&code=${code}`],
  ["noncanonical version", `state=${state}&protocolVersion=02&code=${code}`],
  ["duplicate version", `${boundQuery(`code=${code}`)}&protocolVersion=2`],
]) test(`ignores an unbound or non-v2 callback: ${label}`, () => {
  assert.equal(readNativeOAuthCallback(`${callback}?${query}`, state), null);
});

test("callback refuses a malformed expected state even when the supplied state matches it", () => {
  for (const invalidState of ["", "s".repeat(42), "s".repeat(44), `${"s".repeat(42)}.`, `${"s".repeat(42)}=`]) {
    assert.equal(readNativeOAuthCallback(callbackUrl(`code=${code}`, invalidState), invalidState), null);
  }
});

for (const query of ["", "code=", `code=${"x".repeat(42)}`, `code=${"x".repeat(44)}`, `code=${"x".repeat(42)}.`,
  `code=${"x".repeat(42)}%3D`, `code=${"x".repeat(42)}%20`, `code=${"x".repeat(42)}%E7%8D%85`,
  `code=${code}&code=${code}`, "error=OAUTH_FAILED&error=OAUTH_FAILED", `code=${code}&error=OAUTH_FAILED`,
  "error=", "error=lowercase", `error=${"A".repeat(101)}`, `code=${code}&token=untrusted`, `code=${"x".repeat(4097)}`]) {
  test(`invalid callback parameters fail closed (${query.length > 80 ? "oversized code" : query || "empty"})`, () => {
    assert.deepEqual(readNativeOAuthCallback(callbackUrl(query), state), { error: "OAUTH_FAILED" });
  });
}

test("v2 bootstrap requires the echoed state and exact HTTPS API origin/path, with one opaque token query", () => {
  assert.equal(readNativeOAuthBootstrap(bootstrap(), apiBase, state), bootstrapUrl);
  assert.equal(readNativeOAuthBootstrap(bootstrap(), `${apiBase}/`, state), bootstrapUrl);
  assert.equal(readNativeOAuthBootstrap(bootstrap({ bootstrapUrl: `${apiBase}:443/api/mobile/auth/oauth/bootstrap?token=synthetic` }), apiBase, state), `${apiBase}/api/mobile/auth/oauth/bootstrap?token=synthetic`);
});

for (const [label, value] of [
  ["legacy server HTTP-200 payload", { bootstrapUrl }], ["old protocol", bootstrap({ protocolVersion: 1 })],
  ["string protocol", bootstrap({ protocolVersion: "2" })], ["missing state", { protocolVersion: 2, bootstrapUrl }],
  ["wrong echoed state", bootstrap({ state: otherState })], ["empty state", bootstrap({ state: "" })],
  ["null response", null], ["array response", []], ["string response", bootstrapUrl],
  ["non-string URL", bootstrap({ bootstrapUrl: 7 })], ["oversized URL", bootstrap({ bootstrapUrl: `${bootstrapUrl}${"x".repeat(16000)}` })],
]) test(`bootstrap refuses ${label}`, () => {
  assert.equal(readNativeOAuthBootstrap(value, apiBase, state), null);
});

for (const url of [
  "not a URL", `${apiBase.replace("https:", "http:")}/api/mobile/auth/oauth/bootstrap?token=synthetic`,
  "https://other.example.invalid/api/mobile/auth/oauth/bootstrap?token=synthetic",
  "https://native.example.invalid.attacker.invalid/api/mobile/auth/oauth/bootstrap?token=synthetic",
  `${apiBase}:444/api/mobile/auth/oauth/bootstrap?token=synthetic`,
  "https://name:secret@native.example.invalid/api/mobile/auth/oauth/bootstrap?token=synthetic",
  `${apiBase}/api/mobile/auth/oauth/bootstrap/?token=synthetic`, `${apiBase}/api/auth/signin/google?token=synthetic`,
  `${apiBase}/api/mobile/auth/oauth/bootstrap`, `${apiBase}/api/mobile/auth/oauth/bootstrap?token=`,
  `${bootstrapUrl}&token=another`, `${bootstrapUrl}&state=${state}`, `${bootstrapUrl}#fragment`,
]) test(`bootstrap does not open an unsafe or legacy target: ${url}`, () => {
  assert.equal(readNativeOAuthBootstrap(bootstrap({ bootstrapUrl: url }), apiBase, state), null);
});

test("both listeners are ready before opening; unrelated URLs cannot complete a login", async () => {
  const h = harness(), result = h.run();
  await h.opened;
  assert.deepEqual(h.operations.slice(0, 3), ["listen:url", "listen:close", "open"]);
  h.emitUrl(`${callback}.invalid?code=wrong`);
  h.emitUrl(callbackUrl(`code=${code}`, otherState));
  h.emitUrl(`${callback}?code=${code}`);
  assert.equal(h.operations.includes("close"), false);
  h.emitUrl(callbackUrl());
  assert.deepEqual(await result, { code });
  assert.ok(h.operations.includes("remove:url")); assert.ok(h.operations.includes("remove:close"));
});

test("Browser.open rejection resolves an error and removes listeners instead of hanging", async () => {
  const h = harness({ async openBrowser() { throw Error("synthetic native failure"); } });
  assert.deepEqual(await h.run(), { error: "OAUTH_BROWSER_UNAVAILABLE" });
  assert.ok(h.operations.includes("remove:url")); assert.ok(h.operations.includes("remove:close"));
});

test("listener registration failure stops before opening and cleans a late successful handle", async () => {
  const late = deferred<{ remove(): Promise<void> }>(); let removed = false;
  const h = harness({ listenForUrl: () => late.promise, async listenForClose() { throw Error("synthetic plugin unavailable"); } });
  assert.deepEqual(await h.run(), { error: "OAUTH_FAILED" });
  assert.equal(h.operations.includes("open"), false);
  late.resolve({ async remove() { removed = true; } }); await tick();
  assert.equal(removed, true);
});

test("browser dismissal cancels once and removes both listeners", async () => {
  const h = harness(), result = h.run(); await h.opened;
  h.emitClose(); h.emitUrl(callbackUrl());
  assert.deepEqual(await result, { error: "OAUTH_CANCELLED" });
  assert.equal(h.operations.filter(value => value === "remove:url").length, 1);
  assert.equal(h.operations.filter(value => value === "remove:close").length, 1);
});

test("a missing callback has a bounded wait and a late handle is removed", async () => {
  const late = deferred<{ remove(): Promise<void> }>(); let removed = false;
  const h = harness({ listenForClose: () => late.promise, timeoutMs: 5 });
  assert.deepEqual(await h.run(), { error: "OAUTH_TIMEOUT" });
  assert.equal(h.operations.includes("open"), false);
  assert.ok(h.operations.includes("remove:url"));
  late.resolve({ async remove() { removed = true; } }); await tick();
  assert.equal(removed, true);
});

test("superseded attempts never open or close another login's browser", async () => {
  const h = harness(); h.supersede();
  assert.deepEqual(await h.run(), { error: "OAUTH_CANCELLED" });
  assert.equal(h.operations.includes("open"), false); assert.equal(h.operations.includes("close"), false);
  const running = harness(), result = running.run(); await running.opened; running.supersede();
  running.emitUrl(callbackUrl()); await result;
  assert.equal(running.operations.includes("close"), false);
});

test("a timed-out browser open completing late cannot close a newer session's browser", async () => {
  const pendingOpen = deferred<void>(); let closes = 0;
  const h = harness({ openBrowser: () => pendingOpen.promise, async closeBrowser() { closes++; }, timeoutMs: 5 });
  assert.deepEqual(await h.run(), { error: "OAUTH_TIMEOUT" }); assert.equal(closes, 1);
  h.supersede(); pendingOpen.resolve(); await tick(); assert.equal(closes, 1);
});

test("cleanup rejections do not replace a successful result or become unhandled rejections", async () => {
  let deliver!: (url: string) => void;
  const h = harness({ async listenForUrl(cb) { deliver = cb; return { async remove() { throw Error("synthetic cleanup failure"); } }; },
    async closeBrowser() { throw Error("synthetic close failure"); } });
  const result = h.run(); await h.opened; deliver(callbackUrl());
  assert.deepEqual(await result, { code }); await tick();
});

test("only cancellation keeps its internal sentinel; other failures show plain messages", () => {
  assert.equal(nativeOAuthErrorMessage("OAUTH_CANCELLED"), "OAUTH_CANCELLED");
  assert.match(nativeOAuthErrorMessage("OAUTH_TIMEOUT"), /重新開始/);
  assert.match(nativeOAuthErrorMessage("OAUTH_BROWSER_UNAVAILABLE"), /無法開啟登入視窗/);
  assert.match(nativeOAuthErrorMessage("ACCOUNT_LINK_REQUIRED"), /原有方式登入網站/);
  assert.equal(nativeOAuthErrorMessage("untrusted callback error"), "第三方登入未完成，請重新嘗試。");
});

let compiled: Promise<string>;
type ClientOptions = {
  openFailure?: boolean;
  startData?: (body: any) => unknown;
  callbackUrls?: (body: any) => string[];
  crypto?: unknown;
};
async function clientHarness(options: ClientOptions = {}) {
  compiled ??= build({ absWorkingDir: fileURLToPath(new URL("../", import.meta.url)), entryPoints: ["mobile-app/src/contract.ts"], bundle: true,
    write: false, format: "cjs", platform: "node", target: "node22", plugins: [{ name: "synthetic-oauth", setup(builder) {
      builder.onResolve({ filter: /^@(?:capacitor|aparajita)\// }, () => ({ path: "native", namespace: "test-stub" }));
      builder.onLoad({ filter: /.*/, namespace: "test-stub" }, () => ({ contents: `const h=globalThis.__oauthTest;
        export const Capacitor={getPlatform:()=>"ios"}; export const CapacitorHttp={request:o=>h.request(o)};
        export const SecureStorage={getItem:async k=>h.storage.get(k)??null,setItem:async(k,v)=>{h.writes.push({key:k,value:v});h.storage.set(k,v)},removeItem:async k=>{h.storage.delete(k)}};
        export const App={addListener:async(_,cb)=>{h.urlCallback=cb;return {remove:async()=>{h.removed++}}}};
        export const Browser={addListener:async()=>({remove:async()=>{h.removed++}}),open:async o=>{h.opens.push(o);if(h.openFailure)throw Error('synthetic open failure');for(const url of h.callbackUrls())h.urlCallback({url})},close:async()=>{}};`, loader: "js" }));
    } }] }).then(result => result.outputFiles[0].text);
  const requests: any[] = [], storage = new Map<string, string>(), writes: { key: string; value: string }[] = [], opens: any[] = [];
  const h = { storage, writes, opens, openFailure: options.openFailure ?? false, removed: 0, startBody: null as any,
    urlCallback: (_: unknown) => {}, callbackUrls() { return options.callbackUrls?.(h.startBody) ?? [callbackUrl(`code=${code}`, h.startBody.state)]; },
    async request(request: any) {
      requests.push(request);
      if (request.url.endsWith("/start")) {
        h.startBody = request.data;
        return { status: 200, data: options.startData ? options.startData(request.data) : bootstrap({ state: request.data.state }) };
      }
      assert.equal(request.url, `${apiBase}/api/mobile/auth/oauth/exchange`);
      return { status: 200, data: { accessToken: "synthetic-access", refreshToken: "synthetic-refresh" } };
  } };
  const context = { module: { exports: {} as any }, exports: {}, require: createRequire(import.meta.url), __oauthTest: h,
    URL, setTimeout, clearTimeout, TextEncoder, crypto: options.crypto ?? webcrypto };
  runInNewContext(await compiled, context);
  return { client: context.module.exports.createApiClient(apiBase), requests, storage, writes, opens, state: h };
}

for (const provider of ["google", "apple"] as const) test(`iOS ${provider} v2 sends challenge only to start and verifier only to the state-bound exchange`, async () => {
  const h = await clientHarness({ callbackUrls: body => [callbackUrl(`code=${code}`, otherState), `${callback}?code=${code}`, callbackUrl(`code=${code}`, body.state)] });
  await h.client.loginWithProvider(provider);
  assert.equal(h.requests.length, 2);
  const start = h.requests[0], exchange = h.requests[1];
  assert.equal(start.url, `${apiBase}/api/mobile/auth/oauth/${provider}/start`);
  assert.deepEqual(Object.keys(start.data).sort(), ["codeChallenge", "codeChallengeMethod", "protocolVersion", "redirectUri", "state"]);
  assert.equal(start.data.protocolVersion, 2); assert.equal(start.data.redirectUri, callback); assert.equal(start.data.codeChallengeMethod, "S256");
  assert.match(start.data.state, /^[A-Za-z0-9_-]{43}$/); assert.match(start.data.codeChallenge, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(exchange.url, `${apiBase}/api/mobile/auth/oauth/exchange`);
  assert.deepEqual(Object.keys(exchange.data).sort(), ["code", "codeVerifier", "protocolVersion", "redirectUri", "state"]);
  assert.equal(exchange.data.protocolVersion, 2); assert.equal(exchange.data.redirectUri, callback); assert.equal(exchange.data.code, code);
  assert.equal(exchange.data.state, start.data.state); assert.match(exchange.data.codeVerifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(start.data.codeChallenge, createHash("sha256").update(exchange.data.codeVerifier, "ascii").digest("base64url"));
  assert.equal(h.opens.length, 1); assert.equal(h.opens[0].url, bootstrapUrl);
  assert.equal(JSON.stringify(start).includes(exchange.data.codeVerifier), false);
  assert.equal(JSON.stringify(h.opens).includes(exchange.data.codeVerifier), false);
  assert.equal("Authorization" in start.headers, false); assert.equal("Authorization" in exchange.headers, false);
  assert.equal(h.storage.get("lionclubs.mobile.accessToken"), "synthetic-access");
  assert.equal(h.storage.get("lionclubs.mobile.refreshToken"), "synthetic-refresh"); assert.equal(h.state.removed, 2);
});

test("iOS contract rejects Browser.open failure promptly and never exchanges or stores a handoff", async () => {
  const h = await clientHarness({ openFailure: true });
  await assert.rejects(h.client.loginWithProvider("apple"), { message: "無法開啟登入視窗，請稍後再試。" });
  assert.equal(h.requests.length, 1); assert.equal(h.storage.size, 0); assert.equal(h.writes.length, 0); assert.equal(h.state.removed, 2);
});

test("each new client login attempt uses fresh state and verifier even after a completed login", async () => {
  const h = await clientHarness(); await h.client.loginWithProvider("google"); await h.client.loginWithProvider("apple");
  const [startA, exchangeA, startB, exchangeB] = h.requests;
  assert.notEqual(startA.data.state, startB.data.state);
  assert.notEqual(exchangeA.data.codeVerifier, exchangeB.data.codeVerifier);
  assert.equal(exchangeA.data.state, startA.data.state); assert.equal(exchangeB.data.state, startB.data.state);
  assert.equal(h.state.removed, 4);
});

test("client refuses to start without secure crypto and cannot open a browser or write tokens", async () => {
  const h = await clientHarness({ crypto: {} });
  await assert.rejects(h.client.loginWithProvider("google"), { message: "目前無法安全開始登入，請稍後重試。" });
  assert.equal(h.requests.length, 0); assert.equal(h.opens.length, 0); assert.equal(h.writes.length, 0);
});

for (const [label, startData] of [
  ["old HTTP-200 server without protocol/state", () => ({ bootstrapUrl })],
  ["old protocol", (body: any) => bootstrap({ protocolVersion: 1, state: body.state })],
  ["missing echoed state", () => ({ protocolVersion: 2, bootstrapUrl })],
  ["mismatched state", () => bootstrap({ state: otherState })],
  ["cross-origin bootstrap", (body: any) => bootstrap({ state: body.state, bootstrapUrl: "https://other.example.invalid/api/mobile/auth/oauth/bootstrap?token=synthetic" })],
  ["HTTP bootstrap", (body: any) => bootstrap({ state: body.state, bootstrapUrl: bootstrapUrl.replace("https:", "http:") })],
  ["legacy provider URL", (body: any) => bootstrap({ state: body.state, bootstrapUrl: `${apiBase}/api/auth/signin/google` })],
  ["duplicate token", (body: any) => bootstrap({ state: body.state, bootstrapUrl: `${bootstrapUrl}&token=another` })],
  ["unexpected query", (body: any) => bootstrap({ state: body.state, bootstrapUrl: `${bootstrapUrl}&codeVerifier=must-not-be-accepted` })],
  ["fragment", (body: any) => bootstrap({ state: body.state, bootstrapUrl: `${bootstrapUrl}#fragment` })],
] as const) test(`client fail-closes ${label} before listeners, browser, exchange or token writes`, async () => {
  const h = await clientHarness({ startData });
  await assert.rejects(h.client.loginWithProvider("google"), { status: 503, message: "第三方登入服務尚未完成更新，請先使用會員信箱與密碼登入。" });
  assert.equal(h.requests.length, 1); assert.equal(h.opens.length, 0); assert.equal(h.state.removed, 0);
  assert.equal(h.writes.length, 0); assert.equal(h.storage.size, 0);
});
