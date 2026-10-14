import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateLionYears, formatLionYear, formatLionYearDateRange, getCurrentLionYearStart, getLionYearForDate, getLionYearStart } from "../src/lib/lion-year";
import { formatJoinDate, formatLionsYear, type MemberExperience } from "../src/lib/experience-data";
import { experienceData, experienceInputSchema, serializeExperience } from "../src/lib/member-experience";

const membership = {
  kind: "membership" as const, level: "club" as const, positionCode: "membership_joined",
  organizationName: "合成測試會", startYear: 2026, datePrecision: "approximate" as const,
  isCurrent: true, visibility: "members" as const,
};
const experience: MemberExperience = {
  ...membership, id: "synthetic-experience", positionName: "加入獅子會", verificationStatus: "under-review",
};

test("June 30 and July 1 select different Lions years", () => {
  assert.equal(getLionYearForDate("2026-06-30"), 2025);
  assert.equal(getLionYearForDate("2026-07-01"), 2026);
  assert.equal(getLionYearStart(2026, 1), 2025);
  assert.equal(getLionYearStart(2026, 6), 2025);
  assert.equal(getLionYearStart(2026, 7), 2026);
  assert.equal(getLionYearStart(2026, 12), 2026);
  assert.equal(formatLionYear(2025, true), "25–26");
  assert.equal(formatLionYear(1999, true), "99–00");
});

test("timestamp boundary is Taiwan midnight, independent of server timezone", () => {
  assert.equal(getLionYearForDate("2026-06-30T15:59:59.999Z"), 2025);
  assert.equal(getLionYearForDate("2026-06-30T16:00:00.000Z"), 2026);
  assert.equal(getCurrentLionYearStart(new Date("2026-01-01T00:00:00Z")), 2025);
  assert.equal(getLionYearForDate("2024-02-29"), 2023);
  for (const date of ["2026-02-29", "2026-04-31", "2026-13-01", "not-a-date"]) assert.equal(getLionYearForDate(date), null);
});

test("unknown or invalid month never invents a membership cohort", () => {
  for (const month of [undefined, null, 0, 13, 1.5, Number.NaN]) {
    assert.equal(getLionYearStart(2026, month), null);
    assert.equal(calculateLionYears("2026", month, new Date("2027-07-01T00:00:00Z")), null);
  }
  assert.equal(calculateLionYears("—", 6), null);
  assert.equal(calculateLionYears("", 6), null);
  const unknownLabel = formatJoinDate(2026);
  assert.ok(unknownLabel);
  assert.match(unknownLabel, /月份待補，會籍年度未定/);
  assert.equal(formatJoinDate(null, 7), null);
  assert.match(formatLionsYear({ ...experience, datePrecision: "month" }), /月份待補/);
  assert.doesNotMatch(formatLionsYear({ ...experience, datePrecision: "month" }), /7 月/);
});

test("lion age rolls forward in July, not January, and needs joining month", () => {
  assert.equal(calculateLionYears("2026", 6, new Date("2026-06-30T15:59:59Z")), 0);
  assert.equal(calculateLionYears("2026", 6, new Date("2026-06-30T16:00:00Z")), 1);
  assert.equal(calculateLionYears(2026, 7, new Date("2027-01-01T00:00:00Z")), 0);
  assert.equal(calculateLionYears(2026, 7, new Date("2027-07-01T00:00:00Z")), 1);
  assert.equal(calculateLionYears(2026, 7, new Date("2026-06-01T00:00:00Z")), 0);
  assert.equal(calculateLionYears(2026, 7, new Date("invalid")), null);
});

test("membership labels show the real month and its short cohort", () => {
  assert.equal(formatJoinDate(2026, 6), "2026 年 6 月（25–26 會籍）");
  assert.equal(formatJoinDate(2026, 7), "2026 年 7 月（26–27 會籍）");
  assert.equal(formatLionsYear({ ...experience, startMonth: 6 }), formatJoinDate(2026, 6));
});

test("role endYear remains the last STARTING year, preserving old multi-term rows", () => {
  assert.equal(formatLionYearDateRange(2026), "2026/07/01–2027/06/30");
  assert.equal(formatLionYearDateRange(2024, 2026), "2024/07/01–2027/06/30");
  assert.equal(formatLionsYear({ ...experience, kind: "position", startYear: 2024, endYear: 2026 }), "2024–2025 至 2026–2027 年度");
  assert.equal(formatLionsYear({ ...experience, kind: "position", startYear: 2024 }), "2024–2025 年度");
  const data = experienceData(experienceInputSchema.parse({ ...membership, kind: "position", startYear: 2024, endYear: 2026, startMonth: 6 }));
  assert.equal(data.endYear, 2026); assert.equal(data.isCurrent, true);
  assert.equal(data.startMonth, null); assert.equal(data.datePrecision, "lions_year");
  assert.equal(experienceInputSchema.safeParse({ ...membership, kind: "position", startYear: 2026, endYear: 2024 }).success, false);
});

test("month DTO accepts nullable unknown and 1–12 only, persists no July default", () => {
  for (const month of [1, 6, 7, 12]) {
    const data = experienceData(experienceInputSchema.parse({ ...membership, startMonth: month }));
    assert.equal(data.startMonth, month); assert.equal(data.datePrecision, "month");
  }
  for (const month of [0, 13, 1.5, "7"]) assert.equal(experienceInputSchema.safeParse({ ...membership, startMonth: month }).success, false);
  const unknown = experienceData(experienceInputSchema.parse(membership));
  assert.equal(unknown.startMonth, null); assert.equal(unknown.datePrecision, "approximate");
  assert.equal(unknown.endYear, null);
});

test("legacy PATCH omission preserves known month, explicit null clears it", () => {
  const legacy = experienceInputSchema.parse({ ...membership, datePrecision: "month" });
  assert.equal(experienceData(legacy, 6).startMonth, 6);
  assert.equal(experienceData(legacy, 6).datePrecision, "month");
  assert.equal(experienceData({ ...legacy, startMonth: null }, 6).startMonth, null);
  assert.equal(experienceData({ ...legacy, startMonth: null }, 6).datePrecision, "approximate");
});

test("serializer round-trips known month and exposes missing legacy month as null", () => {
  const record = {
    ...experience, organizationIsUnlisted: false, multipleDistrictCode: null, districtCode: null,
    endYear: null, note: null, datePrecision: "month", verificationStatus: "under_review",
  };
  const known = serializeExperience({ ...record, startMonth: 6 });
  assert.equal(known.startMonth, 6); assert.equal(known.datePrecision, "month");
  assert.equal(serializeExperience(record).startMonth, null);
  assert.equal(serializeExperience({ ...record, startMonth: null }).startMonth, null);
});
