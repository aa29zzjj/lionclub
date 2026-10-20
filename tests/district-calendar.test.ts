import assert from "node:assert/strict";
import { test } from "node:test";
import { currentMembershipCalendarYear, fetchDistrictCalendarEvents, membershipCalendarRange, sanitizeDistrictCalendarEvents, validCalendarRange } from "../src/lib/district-calendar";

test("calendar real-date, order and bounded annual ranges fail closed", () => {
  for (const [from, to] of [["2026-02-30", "2026-03-01"], ["2026-10-20", "2026-10-20"], ["2026-11-01", "2026-10-20"], ["2025-01-01", "2027-01-01"], ["bad", "2026-10-20"]]) assert.equal(validCalendarRange(from, to), false);
  assert.equal(validCalendarRange("2024-07-01", "2025-07-01"), true);
  assert.deepEqual(membershipCalendarRange(2026), { from: "2026-07-01", to: "2027-07-01" });
  assert.equal(currentMembershipCalendarYear(new Date("2026-06-30T15:59:00Z")), 2025);
  assert.equal(currentMembershipCalendarYear(new Date("2026-06-30T16:00:00Z")), 2026);
});

test("upstream events are bounded, range filtered, deduplicated and sorted without rewriting local times", () => {
  const event = (id: string, start: string, end?: string) => ({ id, title: `Synthetic ${id}`, start, end, extendedProps: { venueName: "測試場地", address: "測試地址", lecturer: "must not expose" } });
  const result = sanitizeDistrictCalendarEvents([
    event("late", "2026-10-21T18:30:00"), event("early", "2026-10-20T08:00:00"),
    event("overlap", "2026-10-19T08:00:00", "2026-10-20T12:00:00"), event("late", "2026-10-21T18:30:00"),
    event("invalid", "2026-10-20T25:00:00"), event("out", "2026-11-01"),
    event("past", "2026-10-19"), event("reverse", "2026-10-20", "2026-10-19"),
  ], "2026-10-20", "2026-11-01");
  assert.deepEqual(result.map((item) => item.id), ["overlap", "early", "late"]);
  assert.equal(result[2].start, "2026-10-21T18:30:00");
  assert.equal("lecturer" in result[0], false);
  assert.throws(() => sanitizeDistrictCalendarEvents({}, "2026-10-20", "2026-11-01"));
});

test("public read-only API adapter has fixed host, cache, timeout and payload limits", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++; assert.equal(String(url), "https://www.300a1.org.tw/activity/getcalendarevents?start=2026-07-01&end=2027-07-01");
    assert.equal(init?.redirect, "error"); assert.ok(init?.signal); assert.deepEqual((init as RequestInit & { next?: unknown }).next, { revalidate: 600 });
    return new Response(JSON.stringify([{ id: "synthetic", title: "測試", start: "2026-10-20T08:00:00" }]));
  };
  assert.equal((await fetchDistrictCalendarEvents("2026-07-01", "2027-07-01", fetcher)).length, 1);
  assert.equal(calls, 1);
  await assert.rejects(fetchDistrictCalendarEvents("2026-02-30", "2027-07-01", fetcher)); assert.equal(calls, 1);
  await assert.rejects(fetchDistrictCalendarEvents("2026-07-01", "2027-07-01", async () => new Response("[]", { headers: { "Content-Length": "2000001" } })), /TOO_LARGE/);
  await assert.rejects(fetchDistrictCalendarEvents("2026-07-01", "2027-07-01", async () => new Response("x".repeat(2_000_001))), /TOO_LARGE/);
  await assert.rejects(fetchDistrictCalendarEvents("2026-07-01", "2027-07-01", async () => new Response("broken")));
});
