// Read-only client for the 300A1 district's own public calendar API — not a scrape,
// this is the same JSON endpoint their public calendar widget calls.
const DISTRICT_CALENDAR_BASE = "https://www.300a1.org.tw/activity/getcalendarevents";

export type DistrictCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  venueName: string | null;
  address: string | null;
};

type RawEvent = {
  id?: unknown;
  title?: unknown;
  start?: unknown;
  end?: unknown;
  allDay?: unknown;
  extendedProps?: { venueName?: unknown; address?: unknown };
};

function sanitize(raw: unknown): DistrictCalendarEvent | null {
  const event = raw as RawEvent;
  if (typeof event?.id !== "string" || typeof event.title !== "string" || typeof event.start !== "string") return null;
  return {
    id: event.id,
    title: event.title.slice(0, 200),
    start: event.start,
    end: typeof event.end === "string" ? event.end : event.start,
    allDay: event.allDay === true,
    venueName: typeof event.extendedProps?.venueName === "string" ? event.extendedProps.venueName.slice(0, 300) : null,
    address: typeof event.extendedProps?.address === "string" ? event.extendedProps.address.slice(0, 300) : null,
  };
}

/** Fetches the district's public official calendar for [start, end]. Never writes, never authenticates. */
export async function fetchDistrictCalendarEvents(start: string, end: string): Promise<DistrictCalendarEvent[]> {
  const url = `${DISTRICT_CALENDAR_BASE}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    // Cache for 10 minutes server-side; this is someone else's site, not ours to hammer.
    next: { revalidate: 600 },
  });
  if (!response.ok) throw new Error(`DISTRICT_CALENDAR_UPSTREAM_${response.status}`);
  const body = await response.json().catch(() => null);
  if (!Array.isArray(body)) throw new Error("DISTRICT_CALENDAR_UNEXPECTED_SHAPE");
  // Upstream returns events unordered; start strings are Taipei-local ISO-like text, so lexical order is chronological.
  return body.map(sanitize).filter((event): event is DistrictCalendarEvent => event !== null)
    .sort((a, b) => a.start.localeCompare(b.start));
}
