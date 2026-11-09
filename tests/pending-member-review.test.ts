import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type { PendingMember } from "../mobile-app/src/contract";
import { pendingMemberReviewSchema, approvedPendingMemberJoinDate, assertPendingMemberSnapshot } from "../src/lib/pending-member-review";
import { readPendingMembers, pendingMemberJoinDraft, pendingMemberJoinLabel, preparePendingMemberReview,
  assertPendingMemberReviewCurrent, pendingMemberReviewAcknowledged } from "../mobile-app/src/pending-member-review";

const member: PendingMember = { id: "synthetic-member", name: "合成待審會員", email: null, phone: null, organization: { id: "synthetic-org", name: "合成分會" },
  joinYear: 2003, joinMonth: 8, createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" };
const parse = (value: unknown) => pendingMemberReviewSchema.parse(value);

test("action-only approval preserves the original year/month; omission is distinct from explicit unknown", () => {
  assert.deepEqual(approvedPendingMemberJoinDate(member, parse({ action: "approve" })), { joinYear: 2003, joinMonth: 8 });
  assert.deepEqual(approvedPendingMemberJoinDate(member, parse({ action: "approve", joinMonth: null })), { joinYear: 2003, joinMonth: null });
  assert.deepEqual(approvedPendingMemberJoinDate(member, parse({ action: "approve", joinYear: null, joinMonth: null })), { joinYear: null, joinMonth: null });
  assert.deepEqual(approvedPendingMemberJoinDate({ joinYear: null, joinMonth: null }, parse({ action: "approve" })), { joinYear: null, joinMonth: null });
});
test("review date validation rejects unknown year with known month and rejects malformed or out-of-range values", () => {
  assert.throws(() => approvedPendingMemberJoinDate(member, parse({ action: "approve", joinYear: null })), /年份/);
  for (const change of [{ joinYear: "2003" }, { joinYear: 1899 }, { joinYear: 2101 }, { joinYear: 2003.5 }, { joinMonth: 0 }, { joinMonth: 13 }, { joinMonth: "8" }]) {
    assert.equal(pendingMemberReviewSchema.safeParse({ action: "approve", ...change }).success, false);
  }
});
test("new snapshot fields are paired and stale date or organization fails closed", () => {
  const input = parse({ action: "approve", expectedOrganizationId: member.organization.id, expectedUpdatedAt: member.updatedAt });
  const pending = { organizationId: member.organization.id, updatedAt: new Date(member.updatedAt) };
  assert.doesNotThrow(() => assertPendingMemberSnapshot(pending, input));
  assert.throws(() => assertPendingMemberSnapshot({ ...pending, organizationId: "changed" }, input), { status: 409 });
  assert.throws(() => assertPendingMemberSnapshot({ ...pending, updatedAt: new Date("2026-11-02T00:00:00.000Z") }, input), { status: 409 });
  assert.equal(pendingMemberReviewSchema.safeParse({ action: "approve", expectedUpdatedAt: member.updatedAt }).success, false);
  assert.equal(pendingMemberReviewSchema.safeParse({ action: "approve", expectedOrganizationId: member.organization.id }).success, false);
});
test("native proposal begins with stored history or explicit unknown; no today fallback", () => {
  assert.deepEqual(pendingMemberJoinDraft(member), { year: "2003", month: "8" });
  assert.deepEqual(pendingMemberJoinDraft({ ...member, joinYear: null, joinMonth: null }), { year: "", month: "" });
  assert.equal(pendingMemberJoinLabel({ joinYear: 2003, joinMonth: null }), "2003 年（月份未知）");
  assert.match(pendingMemberJoinLabel({ joinYear: null, joinMonth: 8 }), /原資料記載 8 月/);
  const review = preparePendingMemberReview(member, "approve", { year: "", month: "" });
  assert.equal(review.joinYear, null); assert.equal(review.joinMonth, null);
  assert.equal(review.expectedUpdatedAt, member.updatedAt); assert.equal(review.expectedOrganizationId, member.organization.id);
  for (const draft of [{ year: "", month: "8" }, { year: "2e3", month: "8" }, { year: "2003.5", month: "8" }, { year: "2003", month: "13" }]) assert.throws(() => preparePendingMemberReview(member, "approve", draft));
});
test("native read and confirmation require a real complete snapshot, and do not guess fields from old APIs", () => {
  assert.deepEqual(readPendingMembers({ members: [member] }), [member]);
  for (const change of [{ updatedAt: undefined }, { joinYear: undefined }, { joinMonth: undefined }, { joinMonth: "8" }, { organization: null }]) assert.throws(() => readPendingMembers({ members: [{ ...member, ...change }] }));
  const review = preparePendingMemberReview(member, "reject", { year: "bad-input-is-not-sent", month: "" });
  assert.equal("joinYear" in review, false);
  assert.doesNotThrow(() => assertPendingMemberReviewCurrent(member, review));
  assert.throws(() => assertPendingMemberReviewCurrent({ ...member, updatedAt: "2026-11-02T00:00:00.000Z" }, review));
  assert.throws(() => assertPendingMemberReviewCurrent({ ...member, organization: { ...member.organization, id: "changed" } }, review));
});
test("a 200 response alone cannot manufacture approval, rejection or the confirmed join date", () => {
  const input = preparePendingMemberReview(member, "approve", { year: "2003", month: "" });
  assert.equal(pendingMemberReviewAcknowledged({ ok: true, status: "ACTIVE", joinYear: 2003, joinMonth: null }, "approve", input), true);
  for (const data of [{}, { ok: true }, { ok: true, status: "ACTIVE" }, { ok: true, status: "ACTIVE", joinYear: 2026, joinMonth: 11 }, { ok: false, status: "REJECTED" }]) {
    assert.equal(pendingMemberReviewAcknowledged(data, "approve", input), false);
  }
  assert.equal(pendingMemberReviewAcknowledged({ ok: true, status: "REJECTED" }, "reject", input), true);
});

let compiled: Promise<string>;
async function harness(handler: (options: any) => Promise<any>) {
  compiled ??= build({ absWorkingDir: fileURLToPath(new URL("../", import.meta.url)), entryPoints: ["mobile-app/src/contract.ts"], bundle: true,
    write: false, format: "cjs", platform: "node", target: "node22", plugins: [{ name: "synthetic-review", setup(builder) {
      builder.onResolve({ filter: /^@(?:capacitor|aparajita)\// }, () => ({ path: "native", namespace: "test-stub" }));
      builder.onLoad({ filter: /.*/, namespace: "test-stub" }, () => ({ contents: `const h=globalThis.__review;
        export const Capacitor={getPlatform:()=>"ios"};export const CapacitorHttp={request:o=>h.request(o)};
        export const SecureStorage={getItem:async()=>"synthetic-token",setItem:async()=>{},removeItem:async()=>{}};
        export const Browser={};export const App={};`, loader: "js" }));
    } }] }).then(result => result.outputFiles[0].text);
  const context = { module: { exports: {} as any }, exports: {}, require: createRequire(import.meta.url), __review: { request: handler }, URL, setTimeout, clearTimeout };
  runInNewContext(await compiled, context);
  return context.module.exports.createApiClient("https://synthetic.example.invalid");
}
test("native client sends explicit nulls with the confirmed version/scope, and rejects a false 200 acknowledgement", async () => {
  const calls: any[] = [], input = preparePendingMemberReview(member, "approve", { year: "", month: "" });
  const client = await harness(async options => { calls.push(options); return { status: 200, data: { ok: true, status: "ACTIVE", joinYear: null, joinMonth: null } }; });
  await client.reviewPendingMember(member.id, "approve", input);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].data)), { action: "approve", expectedUpdatedAt: member.updatedAt, expectedOrganizationId: member.organization.id, joinYear: null, joinMonth: null });
  await assert.rejects(client.reviewPendingMember(member.id, "approve"), /完整/); assert.equal(calls.length, 1);
  const uncertain = await harness(async () => ({ status: 200, data: { ok: true, status: "ACTIVE" } }));
  await assert.rejects(uncertain.reviewPendingMember(member.id, "approve", input), /尚未確認/);
  const legacy = await harness(async () => ({ status: 200, data: { members: [{ ...member, joinYear: undefined }] } }));
  await assert.rejects(legacy.getPendingMembers(), /歷史入會年月或版本/);
});
