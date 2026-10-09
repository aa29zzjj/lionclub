export type ExperienceKind = "membership" | "position" | "honorary" | "advisor" | "other";

export type OrganizationLevel =
  | "international"
  | "md"
  | "district"
  | "region"
  | "zone"
  | "club"
  | "foundation";

export type VerificationStatus = "self-declared" | "under-review" | "verified" | "rejected";
export type ExperienceVisibility = "public" | "members" | "only-me";

export type MemberExperience = {
  id: string;
  kind: ExperienceKind;
  level: OrganizationLevel;
  positionCode: string;
  positionName: string;
  organizationName: string;
  organizationIsUnlisted?: boolean;
  multipleDistrictCode?: string;
  districtCode?: string;
  startYear: number;
  endYear?: number;
  datePrecision: "month" | "lions-year" | "approximate";
  isCurrent: boolean;
  verificationStatus: VerificationStatus;
  visibility: ExperienceVisibility;
  note?: string;
  isDemo?: boolean;
};

export const initialMemberExperiences: MemberExperience[] = [
  {
    id: "experience-membership-1",
    kind: "membership",
    level: "club",
    positionCode: "membership_joined",
    positionName: "加入獅子會",
    organizationName: "台北市獅子會",
    organizationIsUnlisted: false,
    multipleDistrictCode: "300A",
    districtCode: "300A-1",
    startYear: 2022,
    datePrecision: "approximate",
    isCurrent: true,
    verificationStatus: "self-declared",
    visibility: "members",
    isDemo: true,
  },
  {
    id: "experience-position-1",
    kind: "position",
    level: "club",
    positionCode: "club_information",
    positionName: "分會資訊／網站管理",
    organizationName: "台北市獅子會",
    organizationIsUnlisted: false,
    multipleDistrictCode: "300A",
    districtCode: "300A-1",
    startYear: 2025,
    endYear: 2025,
    datePrecision: "lions-year",
    isCurrent: false,
    verificationStatus: "under-review",
    visibility: "members",
    note: "前端版型展示用，並非已核實任職資料。",
    isDemo: true,
  },
];

export const experienceKindOptions: Array<{ value: ExperienceKind; label: string }> = [
  { value: "membership", label: "加入會籍" },
  { value: "position", label: "擔任職務" },
  { value: "honorary", label: "榮譽身分" },
  { value: "advisor", label: "顧問委任" },
  { value: "other", label: "其他" },
];

export const organizationLevelOptions: Array<{ value: OrganizationLevel; label: string }> = [
  { value: "international", label: "國際總會" },
  { value: "md", label: "複合區" },
  { value: "district", label: "區" },
  { value: "region", label: "專區" },
  { value: "zone", label: "分區" },
  { value: "club", label: "分會" },
  { value: "foundation", label: "基金會／特殊" },
];

export const multipleDistrictOptions = ["300A", "300B", "300C", "300D", "300E"] as const;

export const districtOptions: Record<(typeof multipleDistrictOptions)[number], string[]> = {
  "300A": ["300A-1", "300A-2", "300A-3", "300A-5"],
  "300B": ["300B-1", "300B-2", "300B-3", "300B-5", "300B-6"],
  "300C": ["300C-1", "300C-2", "300C-3", "300C-5"],
  "300D": ["300D-1", "300D-2"],
  "300E": ["300E-1", "300E-2", "300E-3", "300E-5"],
};

export type PositionOption = {
  code: string;
  label: string;
  level: OrganizationLevel;
  kind: Exclude<ExperienceKind, "membership">;
};

export const positionOptions: PositionOption[] = [
  { code: "intl_president", label: "國際總會長", level: "international", kind: "position" },
  { code: "intl_director", label: "國際理事", level: "international", kind: "position" },
  { code: "md_council_chair", label: "總監議會議長", level: "md", kind: "position" },
  { code: "md_council_vp", label: "總監議會副議長", level: "md", kind: "position" },
  { code: "md_gat", label: "GAT 複合區協調長", level: "md", kind: "position" },
  { code: "dist_governor", label: "區總監", level: "district", kind: "position" },
  { code: "dist_vdg1", label: "第一副總監", level: "district", kind: "position" },
  { code: "dist_vdg2", label: "第二副總監", level: "district", kind: "position" },
  { code: "dist_secretary", label: "內閣秘書長", level: "district", kind: "position" },
  { code: "dist_treasurer", label: "內閣財務長", level: "district", kind: "position" },
  { code: "dist_special_advisor", label: "駐區總監特別顧問", level: "district", kind: "advisor" },
  { code: "dist_honor_governor", label: "榮譽總監", level: "district", kind: "honorary" },
  { code: "region_chair", label: "專區主席", level: "region", kind: "position" },
  { code: "region_secretary", label: "專區秘書", level: "region", kind: "position" },
  { code: "region_advisor", label: "專區顧問", level: "region", kind: "advisor" },
  { code: "zone_chair", label: "分區主席", level: "zone", kind: "position" },
  { code: "zone_secretary", label: "分區秘書", level: "zone", kind: "position" },
  { code: "zone_advisory", label: "分區顧問會議成員", level: "zone", kind: "advisor" },
  { code: "club_president", label: "會長", level: "club", kind: "position" },
  { code: "club_founder_president", label: "首屆會長（創會會長）", level: "club", kind: "position" },
  { code: "club_vp1", label: "第一副會長", level: "club", kind: "position" },
  { code: "club_vp2", label: "第二副會長", level: "club", kind: "position" },
  { code: "club_secretary", label: "秘書", level: "club", kind: "position" },
  { code: "club_treasurer", label: "財務", level: "club", kind: "position" },
  { code: "club_director", label: "理事", level: "club", kind: "position" },
  { code: "club_supervisor", label: "監事", level: "club", kind: "position" },
  { code: "club_honor_president", label: "榮譽會長", level: "club", kind: "honorary" },
  { code: "club_guiding_lion", label: "導獅", level: "club", kind: "advisor" },
  { code: "club_service_chair", label: "服務主席／召集人", level: "club", kind: "position" },
  { code: "club_pr_chair", label: "公關行銷主席／召集人", level: "club", kind: "position" },
  { code: "club_activity_director", label: "活動長／活動召集人", level: "club", kind: "position" },
  { code: "club_information", label: "分會資訊／網站管理", level: "club", kind: "position" },
  { code: "foundation_director", label: "基金會董事／監事", level: "foundation", kind: "position" },
  { code: "special_role", label: "其他職務（需審核）", level: "foundation", kind: "other" },
];

export const verificationLabels: Record<VerificationStatus, string> = {
  "self-declared": "本人填寫",
  "under-review": "待審核",
  verified: "已核實",
  rejected: "未通過",
};

export const visibilityLabels: Record<ExperienceVisibility, string> = {
  public: "公開",
  members: "會員可見",
  "only-me": "僅自己",
};

export function formatLionsYear(experience: MemberExperience) {
  if (experience.kind === "membership") {
    return experience.datePrecision === "month" ? `${experience.startYear} 年 7 月` : `${experience.startYear} 年`;
  }
  const end = experience.endYear ?? experience.startYear;
  if (experience.startYear === end) return `${experience.startYear}–${experience.startYear + 1} 年度`;
  return `${experience.startYear}–${experience.startYear + 1} 至 ${end}–${end + 1} 年度`;
}

export function calculateLionYears(joinYear: string) {
  const parsed = Number(joinYear);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, new Date().getFullYear() - parsed);
}
