import { z } from "zod";
import { positionOptions } from "@/lib/experience-data";

export const experienceInputSchema = z
  .object({
    kind: z.enum(["membership", "position", "honorary", "advisor", "other"]),
    level: z.enum(["international", "md", "district", "region", "zone", "club", "foundation"]),
    positionCode: z.string().min(1).max(80),
    organizationName: z.string().trim().min(1).max(160),
    organizationIsUnlisted: z.boolean().default(false),
    multipleDistrictCode: z.string().trim().max(20).optional(),
    districtCode: z.string().trim().max(30).optional(),
    startYear: z.number().int().min(1917).max(2200),
    endYear: z.number().int().min(1917).max(2200).optional(),
    datePrecision: z.enum(["month", "lions-year", "approximate"]),
    isCurrent: z.boolean(),
    visibility: z.enum(["public", "members", "only-me"]),
    note: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, context) => {
    if (!value.isCurrent && value.endYear !== undefined && value.endYear < value.startYear) {
      context.addIssue({ code: "custom", path: ["endYear"], message: "結束年度不能早於開始年度" });
    }
  });

type ExperienceRecord = {
  id: string;
  kind: string;
  level: string;
  positionCode: string;
  organizationName: string;
  organizationIsUnlisted: boolean;
  multipleDistrictCode: string | null;
  districtCode: string | null;
  startYear: number;
  endYear: number | null;
  datePrecision: string;
  isCurrent: boolean;
  verificationStatus: string;
  visibility: string;
  note: string | null;
};

export function serializeExperience(experience: ExperienceRecord) {
  return {
    ...experience,
    positionName:
      experience.positionCode === "membership_joined"
        ? "加入獅子會"
        : positionOptions.find((position) => position.code === experience.positionCode)?.label ?? experience.positionCode,
    multipleDistrictCode: experience.multipleDistrictCode ?? undefined,
    districtCode: experience.districtCode ?? undefined,
    endYear: experience.endYear ?? undefined,
    note: experience.note ?? undefined,
    datePrecision: experience.datePrecision.replaceAll("_", "-"),
    verificationStatus: experience.verificationStatus.replaceAll("_", "-"),
    visibility: experience.visibility.replaceAll("_", "-"),
    isDemo: false,
  };
}

export function experienceData(input: z.infer<typeof experienceInputSchema>) {
  return {
    kind: input.kind,
    level: input.kind === "membership" ? ("club" as const) : input.level,
    positionCode: input.kind === "membership" ? "membership_joined" : input.positionCode,
    organizationName: input.organizationName,
    organizationIsUnlisted: input.organizationIsUnlisted,
    multipleDistrictCode: input.multipleDistrictCode || null,
    districtCode: input.districtCode || null,
    startYear: input.startYear,
    endYear: input.isCurrent ? null : input.endYear ?? null,
    datePrecision: input.datePrecision.replaceAll("-", "_") as "month" | "lions_year" | "approximate",
    isCurrent: input.isCurrent,
    verificationStatus: "under_review" as const,
    visibility: input.visibility.replaceAll("-", "_") as "public" | "members" | "only_me",
    note: input.note || null,
    verifiedById: null,
    verifiedAt: null,
    rejectedReason: null,
  };
}
