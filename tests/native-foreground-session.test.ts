import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { attachForegroundListener, createForegroundRevalidator, ForegroundIdentityMismatch } from "../mobile-app/src/foreground-session";

// Pure injected lifecycle tests: no native listener, session store, account or
// network is accessed. Source wiring below complements, not replaces, device QA.
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (failure: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const settle = async () => { for (let turn = 0; turn < 8; turn++) await Promise.resolve(); };
type SyntheticMember = { id: string; name: string };
function harness() {
  let generation = 0, epoch = 0, ready = true;
  let member: SyntheticMember | null = { id: "synthetic-member-a", name: "合成會員" };
  let phase = "signed-in", hidden = false, requests = 0;
  const draft = { title: "尚未發布的合成活動", capacity: "30" };
  const mountedView = { tab: "events", draft };
  let view: typeof mountedView | null = mountedView;
  const pending: boolean[] = [], verified: SyntheticMember[] = [], failures: unknown[] = [];
  const responses: ReturnType<typeof deferred<SyntheticMember>>[] = [];
  const controller = createForegroundRevalidator({
    memberId: member.id,
    async getMember() { requests++; const response = deferred<SyntheticMember>(); responses.push(response); return response.promise; },
    captureSessionGuard: () => { const captured = epoch; return () => epoch === captured; },
    getGeneration: () => generation,
    advanceGeneration: () => ++generation,
    isReady: () => ready,
    onPending(value) { hidden = value; pending.push(value); },
    onVerified(result) { member = result; verified.push(result); },
    onUnavailable(failure) {
      failures.push(failure); member = null; view = null;
      phase = (failure as { code?: string })?.code === "UNAUTHENTICATED" ? "signed-out" : "offline";
    },
  });
  return {
    controller, pending, verified, failures, responses, mountedView, draft,
    state: () => ({ generation, member, phase, hidden, requests, view }),
    replaceSession: () => { epoch++; }, advanceExternally: () => { generation++; },
    setReady: (value: boolean) => { ready = value; },
  };
}

test("foreground confirmation keeps the same signed-in view/draft and hides it until the same member is verified", async () => {
  const h = harness();
  h.controller.handleState(false);
  assert.equal(h.state().hidden, true); assert.equal(h.state().requests, 0);
  assert.strictEqual(h.state().view, h.mountedView); assert.strictEqual(h.state().view?.draft, h.draft);
  h.controller.handleState(true);
  assert.equal(h.state().phase, "signed-in"); assert.equal(h.state().requests, 1);
  assert.strictEqual(h.state().view, h.mountedView); assert.equal(h.state().hidden, true);
  h.responses[0].resolve({ id: "synthetic-member-a", name: "已重新確認的合成名稱" });
  await settle();
  assert.equal(h.state().hidden, false); assert.equal(h.state().phase, "signed-in");
  assert.equal(h.state().member?.name, "已重新確認的合成名稱");
  assert.strictEqual(h.state().view, h.mountedView); assert.strictEqual(h.state().view?.draft, h.draft);
  assert.deepEqual(h.pending, [true, true, false]); assert.equal(h.failures.length, 0);
});

test("a different server identity removes private content and never treats the old draft as belonging to that member", async () => {
  const h = harness(); h.controller.handleState(true);
  h.responses[0].resolve({ id: "synthetic-member-b", name: "另一位合成會員" }); await settle();
  assert.equal(h.state().member, null); assert.equal(h.state().view, null); assert.equal(h.state().phase, "offline");
  assert.equal(h.state().hidden, true); assert.equal(h.verified.length, 0);
  assert.ok(h.failures[0] instanceof ForegroundIdentityMismatch);
  h.controller.handleState(false); h.controller.handleState(true);
  assert.equal(h.state().requests, 1, "a failed controller cannot silently retry or reveal a previous view");
});

test("network and authentication failures hide content without claiming that local logout succeeded", async () => {
  for (const failure of [Error("synthetic transport failure"), { code: "UNAUTHENTICATED" }]) {
    const h = harness(); h.controller.handleState(true); h.responses[0].reject(failure); await settle();
    assert.equal(h.state().member, null); assert.equal(h.state().view, null); assert.equal(h.state().hidden, true);
    assert.equal(h.state().phase, "code" in failure ? "signed-out" : "offline");
    assert.equal(h.verified.length, 0); assert.deepEqual(h.failures, [failure]);
  }
});

test("the response from a previous foreground is not shown while backgrounded and a new foreground waits for its own confirmation", async () => {
  const h = harness(); h.controller.handleState(true); h.controller.handleState(false);
  h.responses[0].resolve({ id: "synthetic-member-a", name: "stale-background-result" }); await settle();
  assert.equal(h.verified.length, 0); assert.equal(h.state().hidden, true);
  h.controller.handleState(true); assert.equal(h.state().requests, 2);
  h.responses[1].resolve({ id: "synthetic-member-a", name: "current-result" }); await settle();
  assert.equal(h.state().member?.name, "current-result"); assert.equal(h.state().hidden, false);
});

test("rapid active/inactive/active notifications have one in-flight read and discard the earlier confirmation", async () => {
  const h = harness(); h.controller.handleState(true); h.controller.handleState(true);
  h.controller.handleState(false); h.controller.handleState(true); h.controller.handleState(true);
  assert.equal(h.state().requests, 1);
  h.responses[0].resolve({ id: "synthetic-member-a", name: "stale-foreground" }); await settle();
  assert.equal(h.verified.length, 0); assert.equal(h.state().hidden, true); assert.equal(h.state().requests, 2);
  h.responses[1].resolve({ id: "synthetic-member-a", name: "new-foreground" }); await settle();
  assert.equal(h.verified.length, 1); assert.equal(h.state().hidden, false); assert.equal(h.state().member?.name, "new-foreground");
});

test("unmount/disposal ignores late success and failure and never runs a queued foreground read", async () => {
  for (const rejected of [false, true]) {
    const h = harness(); h.controller.handleState(true); h.controller.handleState(false); h.controller.handleState(true);
    h.controller.dispose();
    if (rejected) h.responses[0].reject(Error("late failure"));
    else h.responses[0].resolve({ id: "synthetic-member-a", name: "late" });
    await settle();
    assert.equal(h.state().requests, 1); assert.equal(h.verified.length, 0); assert.equal(h.failures.length, 0);
    assert.equal(h.pending.includes(false), false);
  }
});

test("account replacement and an external load generation prevent a late read from updating or reopening the old account", async () => {
  for (const change of ["session", "generation"] as const) {
    const h = harness(); h.controller.handleState(true);
    if (change === "session") h.replaceSession(); else h.advanceExternally();
    const generation = h.state().generation;
    h.responses[0].resolve({ id: "synthetic-member-a", name: "previous-account" }); await settle();
    h.controller.handleState(false); h.controller.handleState(true);
    assert.equal(h.verified.length, 0); assert.equal(h.failures.length, 0); assert.equal(h.state().hidden, true);
    assert.equal(h.state().generation, generation); assert.equal(h.state().requests, 1);
  }
});

test("busy or session-end cleanup cannot be superseded by app-state events, including before React cleanup", async () => {
  const before = harness(); before.setReady(false); before.controller.handleState(true);
  assert.equal(before.state().requests, 0); assert.equal(before.state().generation, 0);
  const during = harness(); during.controller.handleState(true); during.setReady(false); during.advanceExternally();
  const generation = during.state().generation;
  during.controller.handleState(false); during.controller.handleState(true);
  during.responses[0].reject({ code: "UNAUTHENTICATED" }); await settle();
  assert.equal(during.state().generation, generation); assert.equal(during.failures.length, 0); assert.equal(during.verified.length, 0);
});

test("listener handles that resolve after cleanup are removed and cannot deliver app-state callbacks", async () => {
  const registration = deferred<{ remove(): Promise<void> }>();
  let callback!: (event: { isActive: boolean }) => void, removed = 0, states = 0, failures = 0;
  const detach = attachForegroundListener({
    addListener(listener) { callback = listener; return registration.promise; },
    onState() { states++; }, onUnavailable() { failures++; },
  });
  await settle(); detach(); detach();
  callback({ isActive: true }); registration.resolve({ async remove() { removed++; } }); await settle();
  assert.equal(removed, 1); assert.equal(states, 0); assert.equal(failures, 0);
});

test("listener registration rejection fails closed and removal rejection is observed without a stale UI callback", async () => {
  const registration = deferred<{ remove(): Promise<void> }>(); const failures: unknown[] = [];
  const detach = attachForegroundListener({ addListener: () => registration.promise, onState() {}, onUnavailable: error => failures.push(error) });
  const failure = Error("synthetic registration failure"); registration.reject(failure); await settle();
  assert.deepEqual(failures, [failure]); detach();
  let removed = 0;
  const detachRemoval = attachForegroundListener({
    async addListener() { return { async remove() { removed++; throw Error("synthetic removal failure"); } }; },
    onState() { assert.fail("no app state emitted"); }, onUnavailable() { assert.fail("removed listener does not change UI"); },
  });
  await settle(); detachRemoval(); await settle(); assert.equal(removed, 1);
});

test("a late registration rejection after disposal does not hide a replacement account", async () => {
  const registration = deferred<{ remove(): Promise<void> }>(); let failures = 0;
  const detach = attachForegroundListener({ addListener: () => registration.promise, onState() {}, onUnavailable() { failures++; } });
  detach(); registration.reject(Error("old listener")); await settle(); assert.equal(failures, 0);
});

test("App wiring keeps Shell present during revalidation, removes it from display/accessibility, and never enters checking for normal resume", () => {
  const app = readFileSync(new URL("../mobile-app/src/App.tsx", import.meta.url), "utf8");
  const effect = app.slice(app.indexOf("const foreground = createForegroundRevalidator"), app.indexOf("async function handleLogin"));
  assert.match(effect, /onVerified: setMember/); assert.match(effect, /captureSessionGuard: api\.captureSessionGuard/);
  assert.match(effect, /setMember\(null\)/); assert.match(effect, /foreground\.dispose\(\); detach\(\)/);
  assert.doesNotMatch(effect, /setPhase\("checking"\)|void loadMe\(/);
  assert.match(app, /foregroundReady\.current = phase === "signed-in" && !busy && !endingSession/);
  const signedIn = app.slice(app.indexOf('if (phase === "signed-in" && member)'), app.indexOf('      <form onSubmit={handleLogin}>'));
  assert.equal((signedIn.match(/<Shell\b/g) ?? []).length, 1);
  assert.match(signedIn, /hidden=\{foregroundRevalidating\} aria-hidden=\{foregroundRevalidating \|\| undefined\}/);
  assert.match(signedIn, /display: "none", pointerEvents: "none"/);
  assert.equal((signedIn.match(/height: "100%", minHeight: 0/g) ?? []).length, 2, "both persistent wrappers must preserve the Shell scroll height");
  assert.doesNotMatch(signedIn, /foregroundRevalidating\s*\?\s*</);
  assert.match(signedIn, /未送出的草稿仍保留/);
});
