// A Lions year starts on July 1 in Taiwan. Calendar joining years and Lions
// starting years are deliberately separate: an unknown month is not January.
function isYear(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 9999;
}

export function getLionYearStart(year: number, month?: number | null): number | null {
  if (!isYear(year) || typeof month !== "number" || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return month < 7 ? year - 1 : year;
}

export function getLionYearForDate(value: Date | string): number | null {
  // Date-only input describes a local calendar date, not midnight UTC.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(`${value}T00:00:00Z`);
    if (
      !Number.isFinite(date.getTime()) || date.getUTCFullYear() !== year ||
      date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day
    ) return null;
    return getLionYearStart(year, month);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei", year: "numeric", month: "numeric",
  }).formatToParts(date);
  return getLionYearStart(
    Number(parts.find((part) => part.type === "year")?.value),
    Number(parts.find((part) => part.type === "month")?.value),
  );
}

export function getCurrentLionYearStart(now: Date = new Date()): number {
  const year = getLionYearForDate(now);
  if (year === null) throw new RangeError("Invalid current date");
  return year;
}

export function formatLionYear(startYear: number, short = false): string {
  const year = (value: number) => short ? String(value % 100).padStart(2, "0") : String(value);
  return `${year(startYear)}–${year(startYear + 1)}`;
}

// endYear is the LAST starting year, not the calendar year in which it ends.
export function formatLionYearDateRange(startYear: number, endYear = startYear): string {
  return `${startYear}/07/01–${endYear + 1}/06/30`;
}

export function calculateLionYears(
  joinYear: number | string | null | undefined,
  joinMonth?: number | null,
  now: Date = new Date(),
): number | null {
  if (joinYear === null || joinYear === undefined || joinYear === "") return null;
  const joined = getLionYearStart(Number(joinYear), joinMonth);
  const current = getLionYearForDate(now);
  if (joined === null || current === null) return null;
  return Math.max(0, current - joined);
}
