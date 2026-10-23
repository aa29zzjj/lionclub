import { z } from "zod";

export const EVENT_TAGS = ["SERVICE", "NETWORKING", "BUSINESS", "SPORT", "LEARNING", "OTHER"] as const;
export type EventTag = typeof EVENT_TAGS[number];
export const eventTagLabels: Record<EventTag, string> = {
  SERVICE: "公益服務", NETWORKING: "聯誼交流", BUSINESS: "工商合作",
  SPORT: "運動休閒", LEARNING: "講座學習", OTHER: "其他",
};
export const eventTagsSchema = z.array(z.enum(EVENT_TAGS)).max(3, "活動標籤最多 3 個")
  .refine((tags) => new Set(tags).size === tags.length, "請勿重複標籤");

/** No endAt exists: this is a start-time boundary, NOT a claim that an event ended. */
export function partitionEvents<T extends { startAt: string }>(events: readonly T[], now = Date.now()) {
  const upcoming: T[] = [], past: T[] = [];
  for (const event of events) {
    const start = Date.parse(event.startAt);
    if (!Number.isFinite(start)) continue;
    (start >= now ? upcoming : past).push(event);
  }
  upcoming.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  past.sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));
  return { upcoming, past };
}
