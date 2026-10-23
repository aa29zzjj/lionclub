import assert from "node:assert/strict";
import { test } from "node:test";
import { eventTagsSchema, partitionEvents } from "../src/lib/event-list";
import { calendarMonthRange, shiftCalendarMonth, taipeiEventStartAt } from "../src/lib/event-calendar";

test("event tags accept empty/three choices, reject duplicates, unknown or excessive tags", () => {
  for (const tags of [[], ["SERVICE"], ["SERVICE", "SPORT", "LEARNING"]]) assert.ok(eventTagsSchema.safeParse(tags).success);
  for (const tags of [["SERVICE", "SERVICE"], ["unknown"], ["SERVICE", "SPORT", "LEARNING", "OTHER"]]) assert.equal(eventTagsSchema.safeParse(tags).success, false);
});
test("upcoming boundary is an absolute start instant, including Taiwan midnight/year crossover", () => {
  const now = Date.parse("2026-12-31T16:00:00Z");
  const rows = [{ id: "later", startAt: "2027-01-01T09:00:00+08:00" }, { id: "earlier", startAt: "2026-12-31T23:59:59+08:00" }, { id: "now", startAt: "2027-01-01T00:00:00+08:00" }, { id: "bad", startAt: "invalid" }];
  assert.deepEqual(partitionEvents(rows, now).upcoming.map((row) => row.id), ["now", "later"]);
  assert.deepEqual(partitionEvents(rows, now).past.map((row) => row.id), ["earlier"]);
  assert.equal(rows[0].id, "later");
  assert.equal(partitionEvents(rows, now + 1).upcoming.length, 1);
});
test("month range is exclusive and valid through leap month and year rollover", () => {
  assert.deepEqual(calendarMonthRange("2024-02"), { from: "2024-02-01", to: "2024-03-01" });
  assert.deepEqual(calendarMonthRange("2026-12"), { from: "2026-12-01", to: "2027-01-01" });
  assert.deepEqual(calendarMonthRange(shiftCalendarMonth("2026-07", -1)), { from: "2026-06-01", to: "2026-07-01" });
  assert.throws(() => calendarMonthRange("2026-13"));
  assert.equal(taipeiEventStartAt("2027-01-01", "00:00"), "2026-12-31T16:00:00.000Z");
});
