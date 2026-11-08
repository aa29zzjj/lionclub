import { z } from "zod";

const joinYear = z.number().int().min(1900).max(2100).nullable();
const joinMonth = z.number().int().min(1).max(12).nullable();
export const pendingMemberReviewSchema = z.object({
  action: z.enum(["approve", "reject"]), joinYear: joinYear.optional(), joinMonth: joinMonth.optional(),
  expectedUpdatedAt: z.string().datetime().optional(), expectedOrganizationId: z.string().trim().min(1).max(200).optional(),
}).refine(value => Boolean(value.expectedUpdatedAt) === Boolean(value.expectedOrganizationId), { message: "請重新載入完整的申請版本及分會資料" });
export class PendingMemberReviewError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
type ReviewInput = z.infer<typeof pendingMemberReviewSchema>;

export function assertPendingMemberSnapshot(pending: { organizationId: string; updatedAt: Date }, input: ReviewInput) {
  if (input.expectedOrganizationId !== undefined && (input.expectedOrganizationId !== pending.organizationId
    || +new Date(input.expectedUpdatedAt!) !== +pending.updatedAt)) {
    throw new PendingMemberReviewError(409, "申請內容或分會已更新，請重新載入後再核對。");
  }
}

/** Omission preserves the stored history; null explicitly means unknown.
 * Approval never infers a join date from the review date. */
export function approvedPendingMemberJoinDate(pending: { joinYear: number | null; joinMonth: number | null }, input: ReviewInput) {
  const value = { joinYear: input.joinYear === undefined ? pending.joinYear : input.joinYear,
    joinMonth: input.joinMonth === undefined ? pending.joinMonth : input.joinMonth };
  if (!joinYear.safeParse(value.joinYear).success || !joinMonth.safeParse(value.joinMonth).success) {
    throw new PendingMemberReviewError(400, "請確認入會年份（1900–2100）及月份（1–12），未知可留空。");
  }
  if (value.joinYear === null && value.joinMonth !== null) throw new PendingMemberReviewError(400, "填寫入會月份前，請先確認入會年份；年份未知時月份也須留空。");
  return value;
}
