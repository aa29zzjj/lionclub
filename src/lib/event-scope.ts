export const EVENT_SCOPES = ["CLUB", "ZONE", "REGION", "DISTRICT"] as const;
export type EventScope = (typeof EVENT_SCOPES)[number];

export const eventScopeLabels: Record<EventScope, string> = {
  CLUB: "本分會",
  ZONE: "分區",
  REGION: "專區",
  DISTRICT: "整個區（A1）",
};

/** 發佈到分會以上範圍時，必須持有以下任一管理角色（或其上層範圍的角色）。CLUB 不限制，任何會員皆可發佈。 */
export const EVENT_SCOPE_REQUIRED_ROLES: Record<EventScope, string[]> = {
  CLUB: [],
  ZONE: ["ZONE_ADMIN", "REGION_ADMIN", "DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"],
  REGION: ["REGION_ADMIN", "DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"],
  DISTRICT: ["DISTRICT_ADMIN", "MULTIDISTRICT_ADMIN", "SUPER_ADMIN"],
};
