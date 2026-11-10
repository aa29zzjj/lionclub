import test from "node:test";
import assert from "node:assert/strict";
import { serviceDate, serviceYearRange, validateServiceDate, validateOutcome, serviceDedupKey, needTransition, serviceReviewOrganizationIds, assertReviewAllowed, parseServiceAction, markdownText, type ServiceHubData } from "../src/lib/service-contract";
import { createServiceTransport, ServiceClientError } from "../src/lib/service-client";
const now = new Date("2026-11-10T03:00:00Z");
const org = (id: string, level: string, parentId: string | null = null) => ({ id, level, parentId, isActive: true, validFrom: null, validTo: null });
const grant = (role: string, scopeType: string, scopeId: string | null) => ({ role, scopeType, scopeId, validFrom: new Date("2026-01-01"), validUntil: null as Date | null });

test("real calendar dates, Taipei future-day boundary and Lions-year ranges", () => {
  assert.equal(serviceDate.safeParse("2026-02-30").success, false);
  assert.equal(serviceDate.safeParse("2024-02-29").success, true);
  validateServiceDate("2026-07-01", new Date("2026-06-30T16:00:00Z"));
  assert.throws(() => validateServiceDate("2026-07-02", new Date("2026-06-30T16:00:00Z")));
  assert.equal(serviceYearRange(2026).gte.toISOString(), "2026-07-01T00:00:00.000Z");
});
test("confirmed group totals cannot invent personal hours or exceed checked-in duration", () => {
  const start = new Date("2026-10-18T00:00:00Z");
  validateOutcome({ endAt: "2026-10-18T04:00:00Z", totalServiceMinutes: 480 }, start, 2, now);
  assert.throws(() => validateOutcome({ endAt: "2026-10-18T04:00:00Z", totalServiceMinutes: 481 }, start, 2, now));
  assert.throws(() => validateOutcome({ endAt: "2026-10-18T00:00:00Z", totalServiceMinutes: 0 }, start, 2, now));
  assert.throws(() => validateOutcome({ endAt: "2027-01-01T00:00:00Z", totalServiceMinutes: 0 }, start, 2, now));
  assert.throws(() => validateOutcome({ endAt: "2026-10-18T04:00:00Z", totalServiceMinutes: 1 }, start, 0, now));
});
test("matching requires response, acceptance and explicit completion in order", () => {
  assert.equal(needTransition("RESPONDED", "accept"), "MATCHED");
  assert.equal(needTransition("MATCHED", "complete"), "COMPLETED");
  for (const status of ["OPEN", "RESPONDED", "COMPLETED", "CLOSED"]) assert.throws(() => needTransition(status, "complete"));
  assert.equal(needTransition("MATCHED", "close"), "CLOSED");
});
test("only live correctly scoped grants authorize service review", () => {
  const organizations = [org("district", "district"), org("club-a", "club", "district"), org("club-b", "club")];
  assert.deepEqual(serviceReviewOrganizationIds([grant("CLUB_PRESIDENT", "club", "club-a")], organizations, now), ["club-a"]);
  assert.deepEqual(serviceReviewOrganizationIds([grant("DISTRICT_ADMIN", "district", "district")], organizations, now), ["district", "club-a"]);
  assert.deepEqual(serviceReviewOrganizationIds([grant("CLUB_PRESIDENT", "district", "district")], organizations, now), []);
  assert.deepEqual(serviceReviewOrganizationIds([grant("SUPER_ADMIN", "club", "club-a")], organizations, now), []);
  assert.deepEqual(serviceReviewOrganizationIds([{ ...grant("CLUB_PRESIDENT", "club", "club-a"), validUntil: now }], organizations, now), []);
  assert.deepEqual(serviceReviewOrganizationIds([{ ...grant("CLUB_PRESIDENT", "club", "club-a"), validFrom: new Date("2027-01-01") }], organizations, now), []);
  assert.deepEqual(serviceReviewOrganizationIds([grant("SUPER_ADMIN", "GLOBAL", null)], [org("bad", "club", "missing")], now), []);
  assert.deepEqual(serviceReviewOrganizationIds([grant("SUPER_ADMIN", "GLOBAL", null)], [{ ...org("bad", "club"), isActive: false }], now), []);
  assert.throws(() => assertReviewAllowed("a", "a", "club-a", ["club-a"]));
  assert.throws(() => assertReviewAllowed("a", "b", "club-b", ["club-a"]));
});
test("server-owned author, status and confirmation cannot be supplied as form fields", () => {
  const value = { action: "entry.create", requestId: "11111111-1111-4111-8111-111111111111", title: "服務紀錄", date: "2026-10-18", category: "環境", minutes: 60 };
  assert.equal(parseServiceAction(value).action, "entry.create");
  for (const extra of [{ status: "CONFIRMED" }, { reviewedById: "chair" }, { memberId: "other" }, { minutes: 961 }]) assert.throws(() => parseServiceAction({ ...value, ...extra }));
  assert.equal(serviceDedupKey("2026-10-18", "  Ａ  活動 "), serviceDedupKey("2026-10-18", "a 活動"));
  assert.equal(serviceDedupKey("2026-10-18", "title1", "e1"), serviceDedupKey("2026-10-19", "title2", "e1"));
  assert.equal(markdownText("![x](https://external.invalid)\n<script>"), "\\!\\[x\\](https://external.invalid) \\<script\\>");
});
const hub = (viewerId: string): ServiceHubData => ({ viewerId, year: 2026, memberName: "合成會員", organizationName: "合成分會", canReview: false, needs: [], entries: [], reviewEntries: [], events: [], totals: { confirmedMinutes: 0, pendingMinutes: 0, confirmedCount: 0, pendingCount: 0 }, nextCursors: { needs: null, entries: null, events: null, review: null } });
test("client includes expected member, rejects malformed replies and does not accept another account's data", async () => {
  let expected: string | undefined;
  const client = createServiceTransport("a", async (_m, _q, _b, member) => { expected = member; return { status: 200, data: hub("a") }; });
  assert.equal((await client.read("year=2026")).viewerId, "a"); assert.equal(expected, "a");
  await assert.rejects(createServiceTransport("a", async () => ({ status: 200, data: hub("b") })).read(""), (e: unknown) => e instanceof ServiceClientError && e.code === "SESSION_CHANGED");
  await assert.rejects(createServiceTransport("a", async () => ({ status: 200, data: {} })).read(""));
  await assert.rejects(createServiceTransport("a", async () => ({ status: 200, data: { ok: false } })).mutate({}));
});
test("account replacement fences delayed responses and cannot leak native errors or unsafe download names", async () => {
  let current = true; let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const client = createServiceTransport("a", async () => { await wait; return { status: 200, data: hub("a") }; }, () => current);
  const pending = client.read(""); current = false; release();
  await assert.rejects(pending, (e: unknown) => e instanceof ServiceClientError && e.code === "SESSION_CHANGED");
  const failing = createServiceTransport("a", async () => { throw new Error("SYNTHETIC_SECRET_DO_NOT_SHOW"); });
  await assert.rejects(failing.mutate({}), (e: unknown) => e instanceof Error && !e.message.includes("SYNTHETIC_SECRET"));
  await assert.rejects(createServiceTransport("a", async () => ({ status: 200, data: { filename: "../private.md", content: "x" } })).export(""));
});
