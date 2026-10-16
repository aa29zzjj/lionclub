import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteOwnAccount, loginForDeletion, readDeletionIdentity } from "../src/app/account/delete/client";

const json = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(value), { status, headers });

test("external page identity comes from the current Session and allows legacy missing profile email", async () => {
  let request: RequestInit | undefined;
  const identity = await readDeletionIdentity(async (url, init) => { assert.equal(url, "/api/me"); request = init; return json({ id: "member-synthetic", name: "合成會員", email: null, adminRoles: ["not exposed"] }); });
  assert.deepEqual(identity, { id: "member-synthetic", name: "合成會員", email: null });
  assert.equal(request?.cache, "no-store"); assert.equal(request?.credentials, "same-origin");
  assert.equal(await readDeletionIdentity(async () => json({}, 401)), null);
  await assert.rejects(readDeletionIdentity(async () => json({ error: "FAKE_PRIVATE_DATABASE_MESSAGE" }, 500)), error => error instanceof Error && !error.message.includes("DATABASE"));
  await assert.rejects(readDeletionIdentity(async () => json({ ok: true })));
});

test("external login stays in the deletion workflow and is not itself a delete operation", async () => {
  const calls: string[] = [];
  await loginForDeletion(" Legacy@Example.test ", "synthetic-password", async (url, init) => {
    calls.push(String(url)); assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { email: "Legacy@Example.test", password: "synthetic-password" });
    return json({ ok: true, memberId: "member-synthetic" });
  });
  assert.deepEqual(calls, ["/api/auth/login"]);
  await assert.rejects(loginForDeletion("synthetic@example.test", "0204", async () => json({ error: "請先設定新密碼", code: "PASSWORD_RESET_REQUIRED" }, 403)), /設定新密碼/);
});

test("delete submits password only, never a target member ID, and requires explicit completion", async () => {
  let count = 0;
  const result = await deleteOwnAccount("synthetic-password", async (url, init) => {
    count++; assert.equal(url, "/api/me/account-deletion"); assert.equal(init?.method, "POST"); assert.equal(init?.credentials, "same-origin");
    assert.deepEqual(JSON.parse(String(init?.body)), { password: "synthetic-password" });
    return json({ ok: true, accountDeleted: true, cleanupPending: true, cleanupId: "private-job-not-shown" });
  });
  assert.equal(count, 1); assert.deepEqual(result, { kind: "deleted", cleanupPending: true });
  assert.equal((await deleteOwnAccount("synthetic-password", async () => json({ ok: true }))).kind, "unknown");
  assert.equal((await deleteOwnAccount("synthetic-password", async () => json({ ok: true, accountDeleted: true }))).kind, "unknown");
});

test("wrong password and live-role/activity conflicts are rejections, never a queued request or success", async () => {
  for (const [status, message] of [[401, "密碼不正確"], [409, "仍有有效或預定的幹部權限"], [409, "仍有未來主辦活動"]] as const) {
    let count = 0;
    const result = await deleteOwnAccount("synthetic-password", async () => { count++; return json({ error: message }, status); });
    assert.deepEqual(result, { kind: "rejected", status, message }); assert.equal(count, 1);
  }
});

test("transport/5xx/malformed-success results stay unknown without destructive retries", async () => {
  for (const behavior of [async () => { throw new Error("SYNTHETIC_NETWORK_FAILURE"); }, async () => json({ error: "SYNTHETIC_FAILURE_AFTER_COMMIT" }, 500), async () => new Response("not-json", { status: 200 })]) {
    let count = 0;
    const result = await deleteOwnAccount("synthetic-password", async () => { count++; return behavior(); });
    assert.equal(result.kind, "unknown"); assert.equal(count, 1);
    if (result.kind === "unknown") assert.match(result.message, /尚無法確認/);
  }
});

test("empty passwords never send and Retry-After remains visible without an automatic retry", async () => {
  assert.equal((await deleteOwnAccount("", async () => { throw new Error("MUST_NOT_CALL"); })).kind, "rejected");
  const result = await deleteOwnAccount("synthetic-password", async () => json({ error: "稍後再試" }, 429, { "Retry-After": "60" }));
  assert.deepEqual(result, { kind: "rejected", status: 429, message: "稍後再試", retryAfterSeconds: 60 });
});
