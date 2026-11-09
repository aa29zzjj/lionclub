import type { PendingMember, PendingMemberReviewInput } from "./contract";

export type PendingMemberJoinDraft = { year: string; month: string };
export type PendingMemberReview = PendingMemberReviewInput & { memberId: string; action: "approve" | "reject" };
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const nullableInteger = (value: unknown, min: number, max: number) => value === null || typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const nullableString = (value: unknown) => value === null || typeof value === "string";

/** Missing historical fields mean the service has not been updated. Never
 * substitute the review date or guess that a missing proposal is unknown. */
export function readPendingMembers(value: unknown): PendingMember[] {
  if (!record(value) || !Array.isArray(value.members)) throw Error("PENDING_MEMBERS_RESPONSE_INVALID");
  for (const item of value.members) {
    if (!record(item) || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !nullableString(item.email) || !nullableString(item.phone)
      || !record(item.organization) || typeof item.organization.id !== "string" || !item.organization.id || typeof item.organization.name !== "string"
      || !validDate(item.createdAt) || !validDate(item.updatedAt) || !nullableInteger(item.joinYear, 1900, 2100) || !nullableInteger(item.joinMonth, 1, 12)) {
      throw Error("PENDING_MEMBERS_RESPONSE_INVALID");
    }
  }
  return value.members as PendingMember[];
}

export function pendingMemberJoinDraft(member: PendingMember): PendingMemberJoinDraft {
  return { year: member.joinYear === null ? "" : String(member.joinYear), month: member.joinMonth === null ? "" : String(member.joinMonth) };
}
function draftNumber(raw: string, min: number, max: number, label: string) {
  const value = raw.trim();
  if (value === "") return null;
  if (!/^\d+$/.test(value) || !Number.isInteger(Number(value)) || Number(value) < min || Number(value) > max) throw Error(`請確認${label}（${min}–${max}），未知可留空。`);
  return Number(value);
}
export function preparePendingMemberReview(member: PendingMember, action: "approve" | "reject", draft: PendingMemberJoinDraft): PendingMemberReview {
  if (!validDate(member.updatedAt) || !member.organization.id) throw Error("申請版本尚未確認，請重新載入名單。");
  const base = { memberId: member.id, action, expectedUpdatedAt: member.updatedAt, expectedOrganizationId: member.organization.id };
  if (action === "reject") return base;
  const joinYear = draftNumber(draft.year, 1900, 2100, "入會年份");
  const joinMonth = draftNumber(draft.month, 1, 12, "入會月份");
  if (joinYear === null && joinMonth !== null) throw Error("填寫入會月份前，請先確認入會年份；年份未知時月份也須留空。");
  return { ...base, joinYear, joinMonth };
}
export function assertPendingMemberReviewCurrent(member: PendingMember | undefined, review: PendingMemberReview) {
  if (!member || member.id !== review.memberId || member.updatedAt !== review.expectedUpdatedAt || member.organization.id !== review.expectedOrganizationId) throw Error("申請內容或分會已更新，請重新載入後再核對。");
}
export function pendingMemberJoinLabel(value: { joinYear: number | null; joinMonth: number | null }) {
  return value.joinYear === null ? value.joinMonth === null ? "入會年月未知" : `年份未知（原資料記載 ${value.joinMonth} 月，請核對）` : `${value.joinYear} 年${value.joinMonth === null ? "（月份未知）" : ` ${value.joinMonth} 月`}`;
}
export function validPendingMemberReviewInput(action: "approve" | "reject", input: PendingMemberReviewInput) {
  return Boolean(input && validDate(input.expectedUpdatedAt) && typeof input.expectedOrganizationId === "string" && input.expectedOrganizationId.length > 0
    && (action === "reject" || nullableInteger(input.joinYear, 1900, 2100) && nullableInteger(input.joinMonth, 1, 12) && (input.joinMonth === null || input.joinYear !== null)));
}
export function pendingMemberReviewAcknowledged(value: unknown, action: "approve" | "reject", input: PendingMemberReviewInput) {
  return record(value) && value.ok === true && value.status === (action === "approve" ? "ACTIVE" : "REJECTED")
    && (action === "reject" || value.joinYear === input.joinYear && value.joinMonth === input.joinMonth);
}
