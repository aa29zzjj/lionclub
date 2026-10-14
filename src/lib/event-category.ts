export const EVENT_CATEGORIES = ["CLUB_OFFICIAL", "PERSONAL"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const eventCategoryLabels: Record<EventCategory, string> = {
  CLUB_OFFICIAL: "獅子會活動",
  PERSONAL: "個人／工商活動",
};
