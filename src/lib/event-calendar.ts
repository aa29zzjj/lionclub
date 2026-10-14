/** Calendar keys are civil dates in Taiwan, never the device's local timezone. */
export const EVENT_TIME_ZONE = "Asia/Taipei";

const taipeiDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getTaipeiDateKey(value: string | Date = new Date()): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = taipeiDateFormatter.formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}

function parseMonth(monthKey: string): { year: number; month: number } {
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    throw new RangeError("Invalid calendar month");
  }
  return { year: Number(monthKey.slice(0, 4)), month: Number(monthKey.slice(5, 7)) };
}

export function shiftCalendarMonth(monthKey: string, offset: number): string {
  const { year, month } = parseMonth(monthKey);
  if (!Number.isInteger(offset)) throw new RangeError("Month offset must be an integer");
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  const result = date.toISOString().slice(0, 7);
  parseMonth(result);
  return result;
}

export type CalendarDay = { dateKey: string; day: number; inMonth: boolean };

/** Six complete Sunday-first weeks keep the controls in a predictable position. */
export function getCalendarDays(monthKey: string): CalendarDay[] {
  const { year, month } = parseMonth(monthKey);
  const first = new Date(Date.UTC(year, month - 1, 1));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, 1 - first.getUTCDay() + index));
    const dateKey = date.toISOString().slice(0, 10);
    return { dateKey, day: date.getUTCDate(), inMonth: dateKey.startsWith(`${monthKey}-`) };
  });
}

export function groupEventsByTaipeiDate<T extends { startAt: string }>(events: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const event of events) {
    const key = getTaipeiDateKey(event.startAt);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());
  }
  return groups;
}

/** A datetime-local input represents Taiwan event time, even on an overseas phone. */
export function taipeiEventStartAt(date: string, time = "00:00"): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const value = new Date(`${date}T${time}:00+08:00`);
  if (!Number.isFinite(value.getTime()) || getTaipeiDateKey(value) !== date) return null;
  return value.toISOString();
}
