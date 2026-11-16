import type { Prisma } from "@prisma/client";
import { CLUB_APPLICATION_PENDING, selectableClubWhere } from "./central-onboarding";
import { generateMemberNo } from "./member-no";
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

export async function approvePendingClubApplication(
  tx: Prisma.TransactionClient,
  pending: { id: string; organizationId: string; organizationAssignmentStatus: string; memberNo: string | null },
  actorId: string,
): Promise<Prisma.MemberUpdateManyMutationInput> {
  if (pending.organizationAssignmentStatus !== CLUB_APPLICATION_PENDING) return {};
  const organization = await tx.organization.findFirst({
    where: { ...selectableClubWhere(), id: pending.organizationId },
    select: { id: true, name: true },
  });
  if (!organization) throw new PendingMemberReviewError(409, "申請的分會目前停用，無法核准。");
  const memberNo = pending.memberNo ?? await generateMemberNo(tx, organization.id);
  await tx.memberOrganizationAssignment.create({ data: {
    memberId: pending.id, assignedById: actorId,
    toOrganizationId: organization.id, toOrganizationName: organization.name,
    previousAssignmentStatus: CLUB_APPLICATION_PENDING, assignmentStatus: "ASSIGNED",
    reason: "核准會員自行選擇的分會",
  } });
  return { memberNo, organizationAssignmentStatus: "ASSIGNED", organizationAssignmentVersion: { increment: 1 } };
}
