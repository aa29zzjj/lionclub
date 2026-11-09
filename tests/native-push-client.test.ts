import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPushController, isKnownPushAction,
  type PushApi, type PushConfig, type PushDeviceInput, type PushNative,
  type PushPermission, type PushStatus, type PushStore,
} from "../mobile-app/src/push-controller";

// Dependency-injected coordinator tests only. No native plugin, Keychain,
// browser, production account, network or real APNs token is accessed.
const MEMBER = "synthetic-member-a";
const INSTALLATION = "e0ff9221-0345-48c6-bb25-a56da852e9c9";
const TOKEN = "A0".repeat(32);
type Callbacks = Parameters<PushNative["listen"]>[0];
type DisableInput = Parameters<PushApi["disablePushDevice"]>[0];
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness() {
  const state = {
    config: { enabled: true, privacyMode: "generic" } as PushConfig,
    permission: "prompt" as PushPermission,
    promptResult: "granted" as PushPermission,
    opted: new Map<string, boolean>(), linked: null as string | null,
    revision: 0, removed: 0, opened: 0,
    calls: [] as string[], statuses: [] as PushStatus[],
    callbacks: [] as Callbacks[], registrations: [] as PushDeviceInput[],
    disables: [] as DisableInput[],
  };
  const hooks: {
    listen?: () => Promise<void>;
    prompt?: () => Promise<PushPermission>;
    register?: () => Promise<void>;
    unregister?: () => Promise<void>;
    registerApi?: (input: PushDeviceInput) => Promise<void>;
    disableApi?: (input: DisableInput) => Promise<void>;
    preference?: (memberId: string, enabled: boolean) => Promise<void>;
  } = {};
  const api: PushApi = {
    async getPushConfig() { state.calls.push("config"); return state.config; },
    async registerPushDevice(input) {
      state.registrations.push({ ...input }); state.calls.push(`POST:${input.revision}:start`);
      await hooks.registerApi?.(input); state.calls.push(`POST:${input.revision}:end`);
    },
    async disablePushDevice(input) {
      state.disables.push({ ...input }); state.calls.push(`DELETE:${input.revision}:start`);
      await hooks.disableApi?.(input); state.calls.push(`DELETE:${input.revision}:end`);
    },
  };
  const native: PushNative = {
    supported: true,
    async permission() { state.calls.push("permission.read"); return state.permission; },
    async requestPermission() {
      state.calls.push("permission.prompt");
      const result = hooks.prompt ? await hooks.prompt() : state.promptResult;
      state.permission = result; return result;
    },
    async register() { state.calls.push("native.register"); await hooks.register?.(); },
    async unregister() { state.calls.push("native.unregister"); await hooks.unregister?.(); },
    async listen(callbacks) {
      state.calls.push("listeners.start"); state.callbacks.push(callbacks);
      await hooks.listen?.(); state.calls.push("listeners.ready");
      return () => { state.removed++; state.calls.push("listeners.remove"); };
    },
  };
  const store: PushStore = {
    async installationId() { return INSTALLATION; },
    async nextRevision() { state.revision++; state.calls.push(`revision:${state.revision}`); return state.revision; },
    async optedIn(memberId) { return state.opted.get(memberId) === true; },
    async setOptedIn(memberId, enabled) {
      state.calls.push(`preference:${memberId}:${enabled}:start`);
      await hooks.preference?.(memberId, enabled);
      state.opted.set(memberId, enabled); state.calls.push(`preference:${memberId}:${enabled}:end`);
    },
    async linkedMember() { return state.linked; },
    async setLinkedMember(memberId) { state.linked = memberId; state.calls.push(`linked:${memberId}`); },
  };
  const create = (memberId = MEMBER) => createPushController({
    memberId, api, native, store,
    changed(value) { state.statuses.push(value); },
    openNotifications() { state.opened++; },
  });
  return { state, hooks, api, native, store, create };
}

test("disabled server, non-iOS support and unsupported privacy mode never inspect or request permission", async () => {
  for (const mode of ["disabled", "non-ios", "unsafe-privacy"] as const) {
    const h = harness();
    if (mode === "disabled") h.state.config.enabled = false;
    if (mode === "non-ios") h.native.supported = false;
    if (mode === "unsafe-privacy") h.state.config.privacyMode = "detailed" as "generic";
    const c = h.create(); await c.refresh(); await c.enable();
    assert.equal(h.state.statuses.at(-1), "unavailable");
    assert.equal(h.state.callbacks.length, 0);
    assert.ok(!h.state.calls.some((call) => call.startsWith("permission.") || call === "native.register"));
    assert.equal(h.state.registrations.length, 0);
    assert.equal(h.state.opted.size, 0);
    if (mode === "non-ios") assert.ok(!h.state.calls.includes("config"));
  }
});

test("refresh and resume can check permission but never display the system prompt", async () => {
  const h = harness(); h.state.opted.set(MEMBER, true);
  const c = h.create(); await c.refresh();
  assert.equal(h.state.statuses.at(-1), "off");
  h.state.callbacks[0].resume(); await flush();
  assert.equal(h.state.calls.filter((call) => call === "permission.prompt").length, 0);
  assert.equal(h.state.calls.filter((call) => call === "native.register").length, 0);
  assert.equal(h.state.calls.filter((call) => call === "listeners.ready").length, 1);
});

test("only explicit enable prompts, after listeners are ready, and valid token registration is normalized", async () => {
  const h = harness(); const c = h.create();
  h.hooks.register = async () => { h.state.callbacks[0].token(TOKEN); };
  await c.enable(); await flush();
  assert.ok(h.state.calls.indexOf("listeners.ready") < h.state.calls.indexOf("permission.prompt"));
  assert.ok(h.state.calls.indexOf("permission.prompt") < h.state.calls.indexOf("native.register"));
  assert.equal(h.state.calls.filter((call) => call === "permission.prompt").length, 1);
  assert.equal(h.state.opted.get(MEMBER), true);
  assert.deepEqual(h.state.registrations, [{ installationId: INSTALLATION, revision: 1, token: TOKEN.toLowerCase(), authorization: "granted" }]);
  assert.equal(h.state.linked, MEMBER); assert.equal(h.state.statuses.at(-1), "on");
});

test("denied permission neither prompts again nor registers a native or server device", async () => {
  const h = harness(); h.state.permission = "denied";
  const c = h.create(); await c.refresh(); await c.enable();
  h.state.callbacks[0].token(TOKEN); await flush();
  assert.equal(h.state.statuses.at(-1), "denied");
  assert.equal(h.state.registrations.length, 0);
  assert.ok(!h.state.calls.includes("permission.prompt"));
  assert.ok(!h.state.calls.includes("native.register"));
  assert.notEqual(h.state.opted.get(MEMBER), true);
});

test("cold start and switching members never reuse another member's opt-in", async () => {
  const h = harness(); h.state.permission = "granted";
  const cold = h.create(); await cold.refresh();
  assert.equal(h.state.statuses.at(-1), "off"); assert.ok(!h.state.calls.includes("native.register"));
  await cold.enable(); const oldCallbacks = h.state.callbacks[0]; await cold.dispose();
  const registerCalls = h.state.calls.filter((call) => call === "native.register").length;
  const next = h.create("synthetic-member-b"); await next.refresh();
  oldCallbacks.token(TOKEN); await flush();
  assert.equal(h.state.calls.filter((call) => call === "native.register").length, registerCalls);
  assert.equal(h.state.registrations.length, 0);
  assert.notEqual(h.state.opted.get("synthetic-member-b"), true);
  await next.enable(); h.state.callbacks[1].token(TOKEN); await flush();
  assert.equal(h.state.opted.get("synthetic-member-b"), true);
  assert.equal(h.state.linked, "synthetic-member-b");
});

test("invalid token events never register devices even after explicit opt-in", async () => {
  const h = harness(); h.state.permission = "granted";
  const c = h.create(); await c.enable();
  for (const token of ["", "a0".repeat(15), "a".repeat(63), "g0".repeat(32), " " + TOKEN, TOKEN + "\n", "0x" + TOKEN, "a0".repeat(513), "https://example.invalid/token"]) h.state.callbacks[0].token(token);
  await flush(); assert.equal(h.state.registrations.length, 0); assert.equal(h.state.linked, null);
  h.state.callbacks[0].token(TOKEN); await flush(); assert.equal(h.state.registrations.length, 1);
});

test("a late token after Settings permission is denied cannot replace denied status with on", async () => {
  const h = harness(); h.state.permission = "granted"; h.state.opted.set(MEMBER, true);
  const c = h.create(); await c.refresh();
  h.state.permission = "denied"; await c.refresh();
  const deniedAt = h.state.statuses.length;
  assert.equal(h.state.statuses.at(-1), "denied");
  h.state.callbacks[0].token(TOKEN); await flush();
  assert.equal(h.state.registrations.length, 0);
  assert.ok(!h.state.statuses.slice(deniedAt).includes("on"));
});

test("disable waits for an in-flight registration and fences it with a higher durable revision before native unregister", async () => {
  const h = harness(); h.state.permission = "granted";
  const registration = deferred(); h.hooks.registerApi = () => registration.promise;
  const c = h.create(); await c.enable(); h.state.callbacks[0].token(TOKEN); await flush();
  assert.equal(h.state.registrations.length, 1);
  const stoppingAt = h.state.statuses.length;
  const stopping = c.disable(); await flush();
  assert.equal(h.state.opted.get(MEMBER), false);
  assert.equal(h.state.disables.length, 0);
  assert.ok(!h.state.calls.includes("native.unregister"));
  h.state.callbacks[0].token("b0".repeat(32)); registration.resolve();
  assert.deepEqual(await stopping, { serverConfirmed: true, nativeConfirmed: true });
  await flush();
  assert.equal(h.state.registrations.length, 1);
  assert.equal(h.state.disables.length, 1);
  assert.ok(h.state.disables[0].revision > h.state.registrations[0].revision);
  assert.ok(h.state.calls.indexOf("POST:1:end") < h.state.calls.indexOf("DELETE:2:start"));
  assert.ok(h.state.calls.indexOf("DELETE:2:end") < h.state.calls.indexOf("native.unregister"));
  assert.ok(!h.state.statuses.slice(stoppingAt).includes("on"));
  h.state.callbacks[0].token(TOKEN); await flush();
  assert.equal(h.state.registrations.length, 1);
  assert.equal(h.state.statuses.at(-1), "off"); assert.equal(h.state.linked, null);
});

test("a pending permission answer after logout-style disable cannot persist opt-in or begin registration", async () => {
  const h = harness(); const permission = deferred<PushPermission>(); h.hooks.prompt = () => permission.promise;
  const c = h.create(); const enabling = c.enable(); await flush();
  assert.ok(h.state.calls.includes("permission.prompt"));
  await c.disable(); permission.resolve("granted"); await enabling; await flush();
  assert.equal(h.state.opted.get(MEMBER), false);
  assert.ok(!h.state.calls.includes("native.register"));
  assert.equal(h.state.registrations.length, 0); assert.equal(h.state.statuses.at(-1), "off");
});

test("a delayed opt-in persistence cannot win after disable or silently re-enable on refresh", async () => {
  const h = harness(); h.state.permission = "granted";
  const preference = deferred(); h.hooks.preference = async (_memberId, enabled) => { if (enabled) await preference.promise; };
  const c = h.create(); const enabling = c.enable(); await flush();
  assert.ok(h.state.calls.includes(`preference:${MEMBER}:true:start`));
  const stopping = c.disable(); await flush();
  preference.resolve(); await enabling; await stopping; await flush();
  assert.equal(h.state.opted.get(MEMBER), false);
  const registerCount = h.state.calls.filter((call) => call === "native.register").length;
  await c.refresh(); await flush();
  assert.equal(h.state.calls.filter((call) => call === "native.register").length, registerCount);
  assert.equal(h.state.statuses.at(-1), "off");
});

test("uncertain server disable is never reported as confirmed and remains retryable without restoring local opt-in", async () => {
  const h = harness(); h.state.permission = "granted"; h.state.linked = MEMBER; h.state.opted.set(MEMBER, true);
  h.hooks.disableApi = async () => { throw new Error("SYNTHETIC_UNCONFIRMED_RESPONSE"); };
  const c = h.create();
  assert.deepEqual(await c.disable(), { serverConfirmed: false, nativeConfirmed: true });
  assert.equal(h.state.opted.get(MEMBER), false); assert.equal(h.state.linked, MEMBER);
  assert.equal(h.state.statuses.at(-1), "error"); assert.ok(h.state.calls.includes("native.unregister"));
  h.hooks.disableApi = undefined;
  assert.deepEqual(await c.disable(), { serverConfirmed: true, nativeConfirmed: true });
  assert.equal(h.state.linked, null); assert.ok(h.state.disables[1].revision > h.state.disables[0].revision);
});

test("native unregister failure is visible even when server disable was confirmed", async () => {
  const h = harness(); h.state.linked = MEMBER;
  h.hooks.unregister = async () => { throw new Error("SYNTHETIC_NATIVE_UNREGISTER_FAILED"); };
  const c = h.create();
  assert.deepEqual(await c.disable(), { serverConfirmed: true, nativeConfirmed: false });
  assert.equal(h.state.statuses.at(-1), "error"); assert.equal(h.state.opted.get(MEMBER), false);
});

test("uncertain registration is remembered for a later disable and its response cannot re-enable after dispose", async () => {
  const h = harness(); h.state.permission = "granted";
  const registration = deferred(); h.hooks.registerApi = () => registration.promise;
  const c = h.create(); await c.enable(); h.state.callbacks[0].token(TOKEN); await flush();
  assert.equal(h.state.linked, MEMBER);
  await c.dispose(); const stoppedAt = h.state.statuses.length;
  registration.resolve(); await flush();
  h.state.callbacks[0].token(TOKEN); await flush();
  assert.equal(h.state.registrations.length, 1); assert.equal(h.state.statuses.length, stoppedAt);
  assert.equal(h.state.removed, 1);
  const logout = h.create(); await logout.disable();
  assert.equal(h.state.disables.length, 1); assert.ok(h.state.disables[0].revision > h.state.registrations[0].revision);
});

test("failed registration never reports on, but disable still attempts server revocation", async () => {
  const h = harness(); h.state.permission = "granted";
  h.hooks.registerApi = async () => { throw new Error("SYNTHETIC_UNCONFIRMED_REGISTRATION"); };
  const c = h.create(); await c.enable(); h.state.callbacks[0].token(TOKEN); await flush();
  assert.equal(h.state.statuses.at(-1), "error"); assert.ok(!h.state.statuses.includes("on"));
  assert.equal(h.state.linked, MEMBER);
  assert.deepEqual(await c.disable(), { serverConfirmed: true, nativeConfirmed: true });
  assert.equal(h.state.disables.length, 1);
});

test("dispose removes completed listeners and closes callbacks even when listener setup finishes late", async () => {
  const h = harness(); const setup = deferred(); h.hooks.listen = () => setup.promise;
  const c = h.create(); const refreshing = c.refresh(); await flush();
  assert.equal(h.state.callbacks.length, 1);
  const disposing = c.dispose();
  h.state.callbacks[0].action({ version: 1, kind: "activity" }); h.state.callbacks[0].token(TOKEN);
  setup.resolve(); await refreshing; await disposing;
  assert.equal(h.state.removed, 1); assert.equal(h.state.opened, 0); assert.equal(h.state.registrations.length, 0);
  const callsAtStop = h.state.calls.length, statusesAtStop = h.state.statuses.length;
  await c.refresh(); await c.enable(); h.state.callbacks[0].resume(); h.state.callbacks[0].error(); await flush();
  assert.equal(h.state.calls.length, callsAtStop); assert.equal(h.state.statuses.length, statusesAtStop);
});

test("only version-one known action kinds open the inbox, never payload URLs or object IDs", async () => {
  const h = harness(); const c = h.create(); await c.refresh();
  const callbacks = h.state.callbacks[0];
  const invalid: unknown[] = [null, undefined, 1, "activity", [], { version: "1", kind: "activity" }, { version: 2, kind: "activity" }, { kind: "activity" }, { version: 1, kind: "admin" }, { version: 1, kind: 1 }, { version: 1, url: "https://malicious.example" }];
  for (const data of invalid) { assert.equal(isKnownPushAction(data), false); callbacks.action(data); }
  assert.equal(h.state.opened, 0);
  for (const kind of ["activity", "friend_invitation", "experience_review", "membership_review"]) {
    const data = { version: 1, kind, url: "https://malicious.example", eventId: "untrusted-event", memberId: "untrusted-member" };
    assert.equal(isKnownPushAction(data), true); callbacks.action(data);
  }
  assert.equal(h.state.opened, 4); assert.equal(h.state.registrations.length, 0);
  await c.disable(); await c.dispose(); callbacks.action({ version: 1, kind: "activity" });
  assert.equal(h.state.opened, 4);
});
