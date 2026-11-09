import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Execute the actual App component with synthetic native/API/hook adapters.
// No browser, credential store, account, real network or provider is accessed.
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const turn = () => new Promise(resolve => setImmediate(resolve));
const jsx = (type, props) => ({ type, props: props || {} });
const flatten = node => node && typeof node === "object" ? [node, ...[node.props?.children].flat(Infinity).flatMap(flatten)] : [];
const text = node => [node?.props?.children].flat(Infinity).map(v => typeof v === "string" ? v : v && typeof v === "object" ? text(v) : "").join("");
function harness(discover, platform = "ios") {
  const hooks = [], effects = [], providerStarts = [];
  let cursor = 0, mounted = true, writesAfterUnmount = 0, writes = 0, discoveryCalls = 0, tree;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = { value: typeof initial === "function" ? initial() : initial };
      return [hooks[i].value, value => { if (!mounted) writesAfterUnmount++; writes++; hooks[i].value = typeof value === "function" ? value(hooks[i].value) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useCallback(callback, deps) { const i = cursor++, old = hooks[i]; if (!old || deps.some((v, n) => v !== old.deps[n])) hooks[i] = { value: callback, deps }; return hooks[i].value; },
    useEffect(callback, deps) { const i = cursor++, old = hooks[i]; if (!old || deps.length !== old.deps.length || deps.some((v, n) => v !== old.deps[n])) {
      hooks[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { hooks[i].cleanup?.(); hooks[i].cleanup = callback(); }); } },
  };
  const api = { hasStoredSession: async () => false, onSessionInvalidated: () => () => {}, captureSessionGuard: () => () => true,
    getOAuthProviders: () => { discoveryCalls++; return discover(); }, login: async () => {}, logout: async () => {},
    me: async () => ({ id: "synthetic-member", name: "合成會員" }), loginWithProvider: async p => { providerStarts.push(p); } };
  const placeholder = () => null, module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL("../mobile-app/src/App.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, API_BASE_URL: "https://native.example.invalid", console,
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "./contract") return { createApiClient: () => api, nativeOAuthAvailable: () => platform !== "android", ApiError: class extends Error {} };
      if (name === "@capacitor/app") return { App: {} };
      if (name === "./NotificationSettings") return { useMobilePush: () => ({ disable: async () => ({ serverConfirmed: true, nativeConfirmed: true }) }) };
      if (name === "./foreground-session") return { createForegroundRevalidator: () => ({ dispose() {}, handleState() {}, unavailable() {} }), attachForegroundListener: () => () => {} };
      if (name === "./session-end-controller") return { createSessionEndController: () => ({ request: async () => {} }) };
      if (name === "./lions-logo.png") return { __esModule: true, default: "data:image/png;synthetic" };
      if (["./Shell", "./HomeScreen", "./FriendsScreen", "./EventsScreen", "./NotificationsScreen", "./MyScreen"].includes(name)) return { __esModule: true, default: placeholder };
      throw Error(`Unapproved synthetic dependency: ${name}`);
    },
  });
  function render() { cursor = 0; tree = module.exports.default(); while (effects.length) effects.shift()(); return tree; }
  return { render, async flush() { for (let i = 0; i < 4; i++) { render(); await turn(); } },
    button(label) { return flatten(tree).find(n => n.type === "button" && text(n) === label); },
    form() { return flatten(tree).find(n => n.type === "form"); }, get text() { return text(tree); },
    get starts() { return providerStarts; }, get calls() { return discoveryCalls; }, get writes() { return writes; }, get writesAfterUnmount() { return writesAfterUnmount; },
    unmount() { mounted = false; for (const hook of hooks) hook?.cleanup?.(); },
  };
}

test("pending provider discovery keeps password login usable without showing unconfirmed buttons", async () => {
  const pending = deferred(), h = harness(() => pending.promise); await h.flush();
  assert.equal(h.button("登入").props.disabled, false); assert.ok(!h.button("使用 Google 繼續")); assert.ok(!h.button("使用 Apple 繼續"));
  assert.match(h.text, /正在確認其他登入方式/); assert.doesNotMatch(h.text, /第三方登入尚未開放/);
  h.unmount(); pending.resolve(["google", "apple"]); await turn(); assert.equal(h.writesAfterUnmount, 0);
});

test("only server-enabled native providers render and start their own login", async () => {
  const h = harness(async () => ["google"]); await h.flush();
  assert.ok(h.button("使用 Google 繼續")); assert.ok(!h.button("使用 Apple 繼續"));
  await h.button("使用 Google 繼續").props.onClick(); await h.flush(); assert.deepEqual(h.starts, ["google"]); h.unmount();
  const both = harness(async () => ["google", "apple"]); await both.flush(); assert.ok(both.button("使用 Google 繼續")); assert.ok(both.button("使用 Apple 繼續")); both.unmount();
});

test("unknown lookup failure requires explicit retry and cannot enable controls or submit login automatically", async () => {
  let attempt = 0; const h = harness(async () => { if (++attempt === 1) throw Error("SYNTHETIC_OFFLINE"); return ["apple"]; });
  await h.flush(); assert.equal(h.calls, 1); assert.equal(h.button("登入").props.disabled, false);
  assert.ok(!h.button("使用 Google 繼續")); assert.ok(!h.button("使用 Apple 繼續")); assert.match(h.text, /目前無法確認/);
  h.button("重新確認登入方式").props.onClick(); await h.flush(); assert.equal(h.calls, 2); assert.ok(h.button("使用 Apple 繼續")); assert.deepEqual(h.starts, []); h.unmount();
});

test("late availability after password login cannot update the new signed-in screen", async () => {
  const pending = deferred(), h = harness(() => pending.promise); await h.flush();
  await h.form().props.onSubmit({ preventDefault() {} }); await h.flush(); const before = h.writes;
  pending.resolve(["google", "apple"]); await h.flush(); assert.equal(h.writes, before); assert.ok(!h.button("使用 Google 繼續")); h.unmount();
});

test("Android and explicit no-provider states show unavailable copy without network or credential changes", async () => {
  const android = harness(() => { throw Error("ANDROID_DISCOVERY_FORBIDDEN"); }, "android"); await android.flush();
  assert.equal(android.calls, 0); assert.ok(!android.button("使用 Google 繼續")); assert.ok(!android.button("使用 Apple 繼續")); assert.match(android.text, /尚未開放/); android.unmount();
  const disabled = harness(async () => []); await disabled.flush(); assert.equal(disabled.button("登入").props.disabled, false); assert.match(disabled.text, /尚未開放/); disabled.unmount();
});
