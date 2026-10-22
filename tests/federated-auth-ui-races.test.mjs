import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Execute the real TSX functions with deterministic hook/router/transport
// adapters. No React DOM/browser, real OAuth, DB, mail or external fetch runs.
// This tests lifecycle/state guards, not layout/accessibility or a real browser.
const root = new URL("../", import.meta.url);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const turn = () => new Promise(resolve => setImmediate(resolve));
const flatten = node => node && typeof node === "object" ? [node, ...[node.props?.children].flat(Infinity).flatMap(flatten)] : [];
const text = node => [node?.props?.children].flat(Infinity).map(value => typeof value === "string" || typeof value === "number" ? String(value) : value && typeof value === "object" ? text(value) : "").join("");
const json = value => new Response(JSON.stringify(value));

function compile(file, additional = "") {
  return ts.transpileModule(readFileSync(new URL(file, root), "utf8") + additional,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
}
function realClient() {
  const module = { exports: {} };
  vm.runInNewContext(compile("src/lib/federated-auth-client.ts"), { module, exports: module.exports, AbortController, Response, URL, setTimeout, clearTimeout, fetch() { throw Error("External fetch forbidden"); } });
  return module.exports;
}

function harness(file, { client = {}, props = {}, search = "", fetcher = () => { throw Error("Unexpected fetch"); }, exported = "default" } = {}) {
  const hooks = []; const pendingEffects = [];
  let cursor = 0, mounted = true, tree, writesAfterUnmount = 0;
  const navigation = [], redirects = [], busy = [];
  let parameters = new URLSearchParams(search);
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = { value: typeof initial === "function" ? initial() : initial };
      return [hooks[i].value, update => { if (!mounted) writesAfterUnmount++; hooks[i].value = typeof update === "function" ? update(hooks[i].value) : update; }];
    },
    useRef(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useId() { const i = cursor++; if (!(i in hooks)) hooks[i] = { id: `synthetic-hook-${i}` }; return hooks[i].id; },
    useEffect(effect, deps) {
      const i = cursor++; const previous = hooks[i];
      if (!previous || !deps || deps.length !== previous.deps?.length || deps.some((value, index) => !Object.is(value, previous.deps[index]))) {
        hooks[i] = { deps, cleanup: previous?.cleanup };
        pendingEffects.push(() => { hooks[i].cleanup?.(); hooks[i].cleanup = effect(); });
      }
    },
    Suspense: Symbol("Suspense"),
  };
  const router = { replace: path => navigation.push(["replace", path]), push: path => navigation.push(["push", path]), refresh: () => navigation.push(["refresh"]) };
  const baseClient = realClient(); const dependencies = { ...baseClient, ...client };
  const placeholder = () => null;
  const module = { exports: {} };
  vm.runInNewContext(compile(file, exported === "RegisterForm" ? "\nexport { RegisterForm };\n" : ""), {
    module, exports: module.exports, AbortController, URLSearchParams, setTimeout, clearTimeout,
    fetch: fetcher, window: { location: { search, assign: url => redirects.push(url) } }, document: { getElementById: () => null },
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: Symbol("Fragment") };
      if (name === "next/navigation") return { useRouter: () => router, useSearchParams: () => parameters };
      if (name === "@/lib/federated-auth-client") return dependencies;
      if (name === "@/lib/mock-data") return { memberTitleOptions: [], tagOptions: [] };
      if (name === "next/link" || name === "@/components/PasswordInput" || name === "@/components/FederatedAuthButtons") return { __esModule: true, default: placeholder };
      throw Error(`Unapproved UI test dependency: ${name}`);
    },
  });
  const component = module.exports[exported];
  const render = () => {
    cursor = 0; tree = component({ onBusyChange: value => busy.push(value), ...props });
    while (pendingEffects.length) pendingEffects.shift()();
    return tree;
  };
  return {
    render, async flush() { for (let i = 0; i < 4; i++) { render(); await turn(); } return tree; },
    nodes: () => flatten(tree), button: label => flatten(tree).find(node => node.type === "button" && text(node).includes(label)),
    unmount() { mounted = false; for (const hook of hooks) hook?.cleanup?.(); pendingEffects.length = 0; },
    setSearch(value) { parameters = new URLSearchParams(value); }, navigation, redirects, busy,
    get writesAfterUnmount() { return writesAfterUnmount; }, client: dependencies,
  };
}

const providers = async () => [{ id: "google", name: "Google", enabled: true }, { id: "apple", name: "Apple", enabled: false }];

test("late OAuth start success after unmount aborts and cannot navigate from the replacement page", async () => {
  const start = deferred(); let signal, calls = 0;
  const h = harness("src/components/FederatedAuthButtons.tsx", { client: { readOAuthProviders: providers,
    startFederatedLogin(_provider, _input, _transport, incoming) { calls++; signal = incoming; return start.promise; } } });
  await h.flush(); h.button("使用 Google").props.onClick(); h.button("使用 Google").props.onClick();
  assert.equal(calls, 1); assert.deepEqual(h.busy, [true]);
  h.unmount(); assert.equal(signal.aborted, true);
  // Deliberately resolve despite abort, as a stale async adapter could do.
  start.resolve("https://accounts.google.com/o/oauth2/v2/auth?state=synthetic"); await turn();
  assert.deepEqual(h.redirects, []); assert.equal(h.writesAfterUnmount, 0); assert.deepEqual(h.busy, [true]);
});

test("late OAuth start failure after unmount cannot update parent busy/error state", async () => {
  const start = deferred();
  const h = harness("src/components/FederatedAuthButtons.tsx", { client: { readOAuthProviders: providers, startFederatedLogin: () => start.promise } });
  await h.flush(); h.button("使用 Google").props.onClick(); h.unmount(); start.reject(Error("synthetic late error")); await turn();
  assert.equal(h.writesAfterUnmount, 0); assert.deepEqual(h.busy, [true]); assert.deepEqual(h.redirects, []);
});

test("live start error unlocks one explicit retry; successful live start navigates once", async () => {
  const first = deferred(), second = deferred(); let calls = 0;
  const h = harness("src/components/FederatedAuthButtons.tsx", { client: { readOAuthProviders: providers, startFederatedLogin: () => (++calls === 1 ? first.promise : second.promise) } });
  await h.flush(); h.button("使用 Google").props.onClick(); first.reject(new h.client.OAuthClientError("RATE_LIMITED", 30)); await h.flush();
  assert.deepEqual(h.busy, [true, false]); assert.equal(calls, 1); assert.ok(h.nodes().some(node => node.props?.role === "status" && text(node).includes("30")));
  h.button("使用 Google").props.onClick(); second.resolve("https://accounts.google.com/o/oauth2/v2/auth?state=synthetic"); await turn();
  assert.equal(calls, 2); assert.equal(h.redirects.length, 1); h.unmount();
});

function registerHarness(readPendingFederatedProfile, cancelFederatedSignup) {
  const posts = [];
  const h = harness("src/app/register/page.tsx", { exported: "RegisterForm", search: "token=synthetic-invite",
    client: { readPendingFederatedProfile, cancelFederatedSignup }, fetcher: async (path, init) => {
      if (path === "/api/onboarding") return json({ mode: "central", requiresInvite: true, inviteMethod: "qr", organization: { id: "synthetic-ai", name: "合成暫存分會", districtCode: "300A-1" } });
      if (String(path).startsWith("/api/invites/verify?")) return json({ valid: true, organizationId: "synthetic-source", organizationName: "合成邀請分會" });
      posts.push({ path, init }); throw Error("No registration should be posted by state checks");
    } });
  return { h, posts };
}

test("pending loading blocks registration and successful pending lookup does not create an account or check consent", async () => {
  const lookup = deferred();
  const { h, posts } = registerHarness(() => lookup.promise, async () => {});
  await h.flush();
  assert.equal(h.button("完成註冊並開通").props.disabled, true);
  const profileForm = h.nodes().find(node => node.type === "form" && node.props["aria-busy"] !== undefined);
  await profileForm.props.onSubmit({ preventDefault() {} }); assert.equal(posts.length, 0);
  lookup.resolve({ pending: true, provider: "google", email: "synthetic@example.test", name: "合成會員", hasInvite: true }); await h.flush();
  const email = h.nodes().find(node => node.props?.id === "register-email");
  assert.equal(email.props.value, "synthetic@example.test"); assert.equal(email.props.readOnly, true);
  assert.ok(h.nodes().filter(node => node.type === "input" && node.props.type === "checkbox").every(node => node.props.checked === false));
  assert.equal(posts.length, 0); h.unmount();
});

test("aborted old pending lookup cannot overwrite a new provider profile", async () => {
  const old = deferred(), fresh = deferred(); const signals = []; let calls = 0;
  const { h, posts } = registerHarness((_transport, signal) => { signals.push(signal); return ++calls === 1 ? old.promise : fresh.promise; }, async () => {});
  await h.flush(); h.setSearch("token=synthetic-invite&federated=1"); await h.flush();
  assert.equal(signals[0].aborted, true); assert.equal(calls, 2);
  fresh.resolve({ pending: true, provider: "google", email: "new@example.test", hasInvite: true }); await h.flush();
  old.resolve({ pending: true, provider: "google", email: "stale@example.test", hasInvite: true }); await h.flush();
  assert.equal(h.nodes().find(node => node.props?.id === "register-email").props.value, "new@example.test");
  assert.equal(posts.length, 0); h.unmount();
});

test("cancel is single-flight and a failed cancellation blocks signup until explicit recovery", async () => {
  const cancel = deferred(); let calls = 0;
  const { h, posts } = registerHarness(async () => ({ pending: true, provider: "google", email: "synthetic@example.test", hasInvite: true }), () => { calls++; return cancel.promise; });
  await h.flush(); const button = h.button("取消驗證／更換帳號"); button.props.onClick(); button.props.onClick();
  assert.equal(calls, 1); await h.flush(); assert.equal(h.button("完成註冊並開通").props.disabled, true);
  cancel.reject(new h.client.OAuthClientError("OAUTH_NETWORK")); await h.flush();
  assert.ok(h.nodes().some(node => node.props?.role === "alert"));
  assert.equal(h.button("完成註冊並開通").props.disabled, true); assert.equal(posts.length, 0); assert.deepEqual(h.navigation, []); h.unmount();
});

test("successful cancellation returns to login only after confirmation and never registers", async () => {
  const cancel = deferred();
  const { h, posts } = registerHarness(async () => ({ pending: true, provider: "google", email: "synthetic@example.test", hasInvite: true }), () => cancel.promise);
  await h.flush(); h.button("取消驗證／更換帳號").props.onClick(); assert.deepEqual(h.navigation, []);
  cancel.resolve(); await h.flush(); assert.deepEqual(h.navigation, [["replace", "/login"]]); assert.equal(posts.length, 0); h.unmount();
});
