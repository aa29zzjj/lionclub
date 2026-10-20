// Read-only adapter for the district's public calendar. No Event records or credentials.
export const DISTRICT_CALENDAR_SOURCE = "https://www.300a1.org.tw/Activity/Calendar";
const DISTRICT_CALENDAR_BASE = "https://www.300a1.org.tw/activity/getcalendarevents";
const MAX_BODY_BYTES = 2_000_000;
const MAX_EVENTS = 3000;

export type DistrictCalendarEvent = {
  id: string; title: string; start: string; end: string; allDay: boolean;
  venueName: string | null; address: string | null;
};

export function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Exclusive upper bound, consistent with the official calendar widget. */
export function validCalendarRange(from: string, to: string): boolean {
  return validCalendarDate(from) && validCalendarDate(to) && to > from
    && Date.parse(to) - Date.parse(from) <= 366 * 86400000;
}

export function membershipCalendarRange(startYear: number) {
  return { from: `${startYear}-07-01`, to: `${startYear + 1}-07-01` };
}

export function currentMembershipCalendarYear(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return month >= 7 ? year : year - 1;
}

function validLocalTime(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 30 || !validCalendarDate(value.slice(0, 10))) return false;
  if (value.length === 10) return true;
  const match = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/.exec(value);
  return !!match && Number(match[1]) < 24 && Number(match[2]) < 60 && Number(match[3] ?? 0) < 60;
}

export function sanitizeDistrictCalendarEvents(body: unknown, from: string, to: string): DistrictCalendarEvent[] {
  if (!validCalendarRange(from, to)) throw new Error("DISTRICT_CALENDAR_INVALID_RANGE");
  if (!Array.isArray(body) || body.length > MAX_EVENTS) throw new Error("DISTRICT_CALENDAR_UNEXPECTED_SHAPE");
  const events: DistrictCalendarEvent[] = [];
  const seen = new Set<string>();
  for (const raw of body) {
    if (!raw || typeof raw !== "object") continue;
    const event = raw as Record<string, unknown>;
    if (typeof event.id !== "string" || !event.id.trim() || event.id.length > 200
      || typeof event.title !== "string" || !event.title.trim() || !validLocalTime(event.start)) continue;
    const end = event.end == null || event.end === "" ? event.start : event.end;
    if (!validLocalTime(end) || end < event.start) continue;
    if (event.start.slice(0, 10) >= to || (end === event.start ? event.start.slice(0, 10) < from : end <= from)) continue;
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    const props = event.extendedProps && typeof event.extendedProps === "object"
      ? event.extendedProps as Record<string, unknown> : {};
    events.push({
      id: event.id, title: event.title.slice(0, 200), start: event.start, end,
      allDay: event.allDay === true,
      venueName: typeof props.venueName === "string" ? props.venueName.slice(0, 300) : null,
      address: typeof props.address === "string" ? props.address.slice(0, 300) : null,
    });
  }
  return events.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}

/** Uses the public endpoint only; bounded fetch/body, ten-minute server cache. */
export async function fetchDistrictCalendarEvents(from: string, to: string, fetcher: typeof fetch = fetch): Promise<DistrictCalendarEvent[]> {
  if (!validCalendarRange(from, to)) throw new Error("DISTRICT_CALENDAR_INVALID_RANGE");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `${DISTRICT_CALENDAR_BASE}?start=${encodeURIComponent(from)}&end=${encodeURIComponent(to)}`;
    const response = await fetcher(url, { headers: { Accept: "application/json" }, redirect: "error", signal: controller.signal, next: { revalidate: 600 } });
    if (!response.ok) throw new Error("DISTRICT_CALENDAR_UPSTREAM_FAILURE");
    if (Number(response.headers.get("Content-Length")) > MAX_BODY_BYTES) throw new Error("DISTRICT_CALENDAR_TOO_LARGE");
    if (!response.body) throw new Error("DISTRICT_CALENDAR_EMPTY_BODY");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BODY_BYTES) throw new Error("DISTRICT_CALENDAR_TOO_LARGE");
        chunks.push(value);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
    const bytes = new Uint8Array(total);
    let position = 0;
    for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
    return sanitizeDistrictCalendarEvents(JSON.parse(new TextDecoder().decode(bytes)), from, to);
  } finally { clearTimeout(timeout); }
}
