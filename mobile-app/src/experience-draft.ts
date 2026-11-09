import { z } from "zod";
import { positionOptions } from "../../src/lib/experience-data";
import type { ExperienceInput, MemberExperience } from "./contract";

export type ExperienceDraft = {
  kind: ExperienceInput["kind"]; level: ExperienceInput["level"]; positionCode: string; customPositionLabel: string;
  organizationName: string; multipleDistrictCode: string; districtCode: string;
  startYear: string; startMonth: string; endYear: string; isCurrent: boolean;
  visibility: ExperienceInput["visibility"]; note: string;
};
const inputSchema = z.object({
  kind: z.enum(["membership", "position", "honorary", "advisor", "other"]),
  level: z.enum(["international", "md", "district", "region", "zone", "club", "foundation"]),
  positionCode: z.string().trim().min(1, "請選擇或填寫職務").max(80, "職務最多 80 字"),
  organizationName: z.string().trim().min(1, "請填寫實際分會／組織名稱").max(160, "組織名稱最多 160 字"),
  organizationIsUnlisted: z.boolean(), multipleDistrictCode: z.string().trim().max(20), districtCode: z.string().trim().max(30),
  startYear: z.number().int().min(1917).max(2200), startMonth: z.number().int().min(1).max(12).nullable(),
  endYear: z.number().int().min(1917).max(2200).optional(),
  datePrecision: z.enum(["month", "lions-year", "approximate"]), isCurrent: z.boolean(),
  visibility: z.enum(["public", "members", "only-me"]), note: z.string().trim().max(1000, "備註最多 1000 字"),
}).superRefine((value, context) => {
  if (value.endYear !== undefined && value.endYear < value.startYear) context.addIssue({ code: "custom", path: ["endYear"], message: "結束年度不能早於開始年度" });
});

export function readExperienceDraft(draft: ExperienceDraft, initial: MemberExperience | null): ExperienceInput {
  const level = draft.kind === "membership" ? "club" : draft.level;
  const unchangedOther = initial?.kind === "other" && draft.kind === "other" && draft.customPositionLabel.trim() === initial.positionName;
  const positionCode = draft.kind === "membership" ? "membership_joined" : draft.kind === "other"
    ? unchangedOther ? initial!.positionCode : draft.customPositionLabel.trim() : draft.positionCode;
  if (draft.kind !== "membership" && draft.kind !== "other") {
    const known = positionOptions.find(option => option.code === positionCode);
    const unchangedLegacy = !known && initial?.positionCode === positionCode && initial.kind === draft.kind && initial.level === level;
    if (!unchangedLegacy && (!known || known.kind !== draft.kind || known.level !== level)) throw new Error("請選擇符合資料類型及層級的職務");
  }
  const organizationName = draft.organizationName.trim();
  const multipleDistrictCode = draft.multipleDistrictCode.trim(), districtCode = draft.districtCode.trim();
  const sameOrganization = Boolean(initial && initial.level === level
    && initial.organizationName.trim() === organizationName
    && (initial.multipleDistrictCode ?? "").trim() === multipleDistrictCode && (initial.districtCode ?? "").trim() === districtCode);
  const startMonth = draft.kind === "membership" && draft.startMonth.trim() ? Number(draft.startMonth) : null;
  const previousPrecision = initial?.datePrecision?.replaceAll("_", "-");
  const datePrecision = draft.kind === "membership" ? startMonth === null ? "approximate" : "month"
    : initial?.kind === draft.kind && ["month", "lions-year", "approximate"].includes(previousPrecision ?? "")
      ? previousPrecision : "lions-year";
  const parsed = inputSchema.safeParse({
    kind: draft.kind, level, positionCode, organizationName,
    organizationIsUnlisted: sameOrganization ? initial!.organizationIsUnlisted : true,
    multipleDistrictCode, districtCode,
    startYear: draft.startYear.trim() ? Number(draft.startYear) : NaN,
    startMonth, endYear: draft.kind !== "membership" && draft.endYear.trim() ? Number(draft.endYear) : undefined,
    datePrecision, isCurrent: draft.isCurrent, visibility: draft.visibility, note: draft.note,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === "startYear" || issue?.path[0] === "endYear") throw new Error("年度須為 1917 至 2200 的整數，且結束年度不得早於開始年度");
    if (issue?.path[0] === "startMonth") throw new Error("月份須留空或填寫 1 至 12 的整數");
    if (issue?.path[0] === "multipleDistrictCode") throw new Error("複合區最多 20 字");
    if (issue?.path[0] === "districtCode") throw new Error("區最多 30 字");
    throw new Error(issue?.message ?? "請確認資歷欄位格式");
  }
  return parsed.data;
}
