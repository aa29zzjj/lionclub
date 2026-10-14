import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getCalendarDays,
  getTaipeiDateKey,
  groupEventsByTaipeiDate,
  shiftCalendarMonth,
  taipeiEventStartAt,
} from "../src/lib/event-calendar";

test("Taiwan dates cross UTC midnight and year boundaries correctly", () => {
  assert.equal(getTaipeiDateKey("2026-10-13T16:00:00Z"), "2026-10-14");
  assert.equal(getTaipeiDateKey("2026-10-13T15:59:59Z"), "2026-10-13");
  assert.equal(getTaipeiDateKey("2026-12-31T16:00:00Z"), "2027-01-01");
  assert.equal(getTaipeiDateKey("not-a-date"), null);
});

test("month navigation crosses years without the device timezone", () => {
  assert.equal(shiftCalendarMonth("2026-12", 1), "2027-01");
  assert.equal(shiftCalendarMonth("2026-01", -1), "2025-12");
  assert.equal(shiftCalendarMonth("2026-10", 0), "2026-10");
  assert.throws(() => shiftCalendarMonth("2026-13", 1), RangeError);
  assert.throws(() => shiftCalendarMonth("2026-10", 0.5), RangeError);
});

test("calendar provides six Sunday-first weeks and adjacent-month dates", () => {
  const days = getCalendarDays("2026-10");
  assert.equal(days.length, 42);
  assert.deepEqual(days[0], { dateKey: "2026-09-27", day: 27, inMonth: false });
  assert.deepEqual(days[4], { dateKey: "2026-10-01", day: 1, inMonth: true });
  assert.equal(days.filter((day) => day.inMonth).length, 31);
  assert.equal(new Set(days.map((day) => day.dateKey)).size, 42);
  assert.equal(days[41].dateKey, "2026-11-07");
});

test("leap February and Sunday month starts are handled", () => {
  assert.equal(getCalendarDays("2024-02").filter((day) => day.inMonth).length, 29);
  assert.equal(getCalendarDays("2025-02").filter((day) => day.inMonth).length, 28);
  assert.deepEqual(getCalendarDays("2026-11")[0], { dateKey: "2026-11-01", day: 1, inMonth: true });
});

test("event grouping uses Taiwan dates, sorts times and does not mutate input", () => {
  const late = { id: "late", startAt: "2026-10-14T12:00:00Z" };
  const early = { id: "early", startAt: "2026-10-13T16:00:00Z" };
  const previous = { id: "previous", startAt: "2026-10-13T15:59:59Z" };
  const invalid = { id: "invalid", startAt: "invalid" };
  const events = [late, previous, early, invalid];
  const groups = groupEventsByTaipeiDate(events);
  assert.deepEqual(groups.get("2026-10-14"), [early, late]);
  assert.deepEqual(groups.get("2026-10-13"), [previous]);
  assert.equal(groups.size, 2);
  assert.deepEqual(events, [late, previous, early, invalid]);
  assert.equal(groupEventsByTaipeiDate([]).size, 0);
});

test("event form dates always become Taiwan time and reject invalid civil dates", () => {
  assert.equal(taipeiEventStartAt("2026-10-14", "18:30"), "2026-10-14T10:30:00.000Z");
  assert.equal(taipeiEventStartAt("2026-10-14"), "2026-10-13T16:00:00.000Z");
  assert.equal(taipeiEventStartAt("2024-02-29", "09:00"), "2024-02-29T01:00:00.000Z");
  assert.equal(taipeiEventStartAt("2025-02-29", "09:00"), null);
  assert.equal(taipeiEventStartAt("2026-13-01", "09:00"), null);
  assert.equal(taipeiEventStartAt("2026-10-14", "24:00"), null);
  assert.equal(taipeiEventStartAt("2026-10-14", "9:00"), null);
});
