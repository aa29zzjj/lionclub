import assert from "node:assert/strict";
import { test } from "node:test";
import { createSessionEndController, type SessionEndDependencies, type SessionGuard, type SessionStopResult } from "../mobile-app/src/session-end-controller";

function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((done, failed) => { resolve = done; reject = failed; }); return { promise, resolve, reject }; }
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const stopped: SessionStopResult = { serverConfirmed: true, nativeConfirmed: false };
function fixture(overrides: Partial<SessionEndDependencies> = {}) {
  let epoch = 0, endCalls = 0, pushCalls = 0;
  const events: string[] = [], completions: SessionStopResult[] = [];
  const guard = (): SessionGuard => { const owner = epoch; return () => owner === epoch; };
  const controller = createSessionEndController({
    async stopPush() { pushCalls++; return stopped; },
    async endSession() { endCalls++; epoch++; return guard(); },
    errorGuard(error) { return (error as { isCurrentSession?: SessionGuard })?.isCurrentSession; },
    onStart() { events.push("start"); }, onComplete(value) { events.push("complete"); completions.push(value); },
    onUnconfirmed() { events.push("unconfirmed"); }, onOwnershipLost() { events.push("lost"); }, onSettled() { events.push("settled"); },
    ...overrides,
  });
  return { controller, guard, events, completions, change() { epoch++; return guard(); }, counts: () => ({ endCalls, pushCalls }) };
}

test("stale or throwing guards are no-ops, without cleanup or UI callbacks", async () => {
  const h = fixture(), old = h.guard(); h.change();
  await h.controller.request(old); await h.controller.request(() => { throw Error("synthetic invalid guard"); });
  assert.deepEqual(h.events, []); assert.deepEqual(h.counts(), { pushCalls: 0, endCalls: 0 });
});
test("ordinary concurrent logout calls share one push/end job and one complete UI lifecycle", async () => {
  const push = deferred<SessionStopResult>(); let pushCalls = 0;
  const h = fixture({ async stopPush() { pushCalls++; return push.promise; } });
  const first = h.controller.request(h.guard()), second = h.controller.request(h.guard());
  assert.equal(first, second); assert.deepEqual(h.events, ["start"]); assert.equal(pushCalls, 1);
  push.resolve(stopped); await first;
  assert.equal(h.counts().endCalls, 1); assert.deepEqual(h.completions, [stopped]); assert.deepEqual(h.events, ["start", "complete", "settled"]);
});
test("a new ended-session recovery joins an existing logout while push cleanup waits, even after its page unmounts", async () => {
  const push = deferred<SessionStopResult>(), h = fixture({ stopPush: () => push.promise });
  let pageMounted = true;
  const first = h.controller.request(h.guard());
  pageMounted = false;
  const ended = h.change(); // A's revoke/refresh changed its epoch and emitted this exact guard.
  const recovery = h.controller.request(ended); // App-level subscription outlives the page.
  assert.equal(recovery, first); assert.equal(pageMounted, false); assert.deepEqual(h.events, ["start"]);
  push.resolve(stopped); await recovery;
  assert.equal(h.counts().endCalls, 1); assert.deepEqual(h.events, ["start", "complete", "settled"]);
});
test("an account replacement without an explicit current request cannot be ended by old cleanup", async () => {
  const push = deferred<SessionStopResult>(), h = fixture({ stopPush: () => push.promise });
  const work = h.controller.request(h.guard()); h.change(); push.resolve(stopped); await work;
  assert.equal(h.counts().endCalls, 0); assert.deepEqual(h.events, ["start", "lost", "settled"]); assert.deepEqual(h.completions, []);
});
test("a stale end response continues an explicitly queued new session before settling the shared overlay", async () => {
  const end = deferred<SessionGuard>(); let endCalls = 0, pushCalls = 0;
  let h!: ReturnType<typeof fixture>;
  h = fixture({ async stopPush() { pushCalls++; return stopped; }, async endSession() {
    endCalls++; if (endCalls === 1) return end.promise; return h.change();
  } });
  const old = h.guard(), first = h.controller.request(old); await tick();
  const current = h.change(), second = h.controller.request(current);
  end.resolve(old); await second;
  assert.equal(first, second); assert.equal(endCalls, 2); assert.equal(pushCalls, 2);
  assert.deepEqual(h.events, ["start", "complete", "settled"]);
});
test("a stale end error cannot mark a replacement unconfirmed, but its explicit recovery may proceed", async () => {
  const end = deferred<SessionGuard>(); let calls = 0;
  let h!: ReturnType<typeof fixture>;
  h = fixture({ async endSession() { if (++calls === 1) return end.promise; return h.change(); } });
  const old = h.guard(), first = h.controller.request(old); await tick();
  const current = h.change(); h.controller.request(current);
  end.reject({ isCurrentSession: old }); await first;
  assert.equal(calls, 2); assert.deepEqual(h.events, ["start", "complete", "settled"]);
});
test("owned clear failure reports unconfirmed exactly once and does not automatically retry", async () => {
  let calls = 0;
  let h!: ReturnType<typeof fixture>;
  h = fixture({ async endSession() { calls++; const ended = h.change(); throw { isCurrentSession: ended }; } });
  await h.controller.request(h.guard()); await tick();
  assert.equal(calls, 1); assert.deepEqual(h.events, ["start", "unconfirmed", "settled"]);
  await h.controller.request(h.guard()); assert.equal(calls, 2);
  assert.deepEqual(h.events, ["start", "unconfirmed", "settled", "start", "unconfirmed", "settled"]);
});
test("unknown end failure retains only its original guard; stale A cannot claim a B failure", async () => {
  const end = deferred<SessionGuard>(), h = fixture({ endSession: () => end.promise });
  const first = h.controller.request(h.guard()); await tick(); h.change(); end.reject(Error("synthetic transport failure")); await first;
  assert.deepEqual(h.events, ["start", "lost", "settled"]);
});
test("push failure stops without calling end or retrying, and preserves the shared lifecycle", async () => {
  const h = fixture({ async stopPush() { throw Error("synthetic native failure"); } });
  await h.controller.request(h.guard()); await tick();
  assert.equal(h.counts().endCalls, 0); assert.deepEqual(h.events, ["start", "unconfirmed", "settled"]);
});
test("an explicit recovery queued during an owned error may retry without a midway settled callback", async () => {
  const end = deferred<SessionGuard>(); let calls = 0;
  let h!: ReturnType<typeof fixture>;
  h = fixture({ async endSession() { if (++calls === 1) return end.promise; return h.change(); } });
  const first = h.controller.request(h.guard()); await tick();
  const ended = h.change(); h.controller.request(ended); end.reject({ isCurrentSession: ended }); await first;
  assert.equal(calls, 2); assert.deepEqual(h.events, ["start", "unconfirmed", "complete", "settled"]);
});
test("a successful owned end absorbs requests for that same ended epoch without another cleanup", async () => {
  const end = deferred<SessionGuard>(); let calls = 0;
  const h = fixture({ async endSession() { calls++; return end.promise; } });
  const first = h.controller.request(h.guard()); await tick();
  const ended = h.change(), sameEnd = h.controller.request(ended); end.resolve(ended); await sameEnd;
  assert.equal(first, sameEnd); assert.equal(calls, 1); assert.deepEqual(h.events, ["start", "complete", "settled"]);
});
test("the latest current recovery replaces an older one; a later stale request cannot erase it", async () => {
  const push = deferred<SessionStopResult>(), h = fixture({ stopPush: () => push.promise });
  const first = h.controller.request(h.guard());
  const older = h.change(); assert.equal(h.controller.request(older), first);
  const newest = h.change(); assert.equal(h.controller.request(newest), first);
  assert.equal(h.controller.request(older), first);
  push.resolve(stopped); await first;
  assert.equal(h.counts().endCalls, 1); assert.deepEqual(h.events, ["start", "complete", "settled"]);
});
test("a failed stale push cleanup does not report another session's failure, and continues explicit recovery", async () => {
  const push = deferred<SessionStopResult>(); let calls = 0;
  const h = fixture({ async stopPush() { if (++calls === 1) return push.promise; return stopped; } });
  const first = h.controller.request(h.guard());
  h.controller.request(h.change()); push.reject(Error("synthetic stale push failure")); await first;
  assert.equal(calls, 2); assert.equal(h.counts().endCalls, 1); assert.deepEqual(h.events, ["start", "complete", "settled"]);
});
test("a new current request emitted during completion stays in the same wave until its own cleanup finishes", async () => {
  let completed = 0;
  let h!: ReturnType<typeof fixture>;
  h = fixture({ onComplete() { h.events.push("complete"); if (++completed === 1) h.controller.request(h.change()); } });
  await h.controller.request(h.guard());
  assert.equal(h.counts().endCalls, 2); assert.deepEqual(h.events, ["start", "complete", "complete", "settled"]);
});
test("a UI callback failure is not mistaken for a failed end API or an instruction to repeat logout", async () => {
  const failure = Error("synthetic UI callback failure");
  let h!: ReturnType<typeof fixture>;
  h = fixture({ onComplete() { h.events.push("complete"); throw failure; } });
  await assert.rejects(h.controller.request(h.guard()), error => error === failure);
  assert.equal(h.counts().endCalls, 1); assert.deepEqual(h.events, ["start", "complete", "settled"]);
});
