import { NextRequest, NextResponse } from "next/server";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { sendSesEmail } from "@/lib/aws-http";
import { APPROVER_ROLES, getAdministeredOrganizationIds } from "@/lib/admin-scope";
import { activeAdminRoleWhere } from "@/lib/active-admin-role";
import { enqueueMobilePush } from "@/lib/mobile-push";
import { resolveMobilePushSettings } from "@/lib/mobile-push-runtime";
import { pendingMemberReviewSchema, PendingMemberReviewError, assertPendingMemberSnapshot, approvedPendingMemberJoinDate } from "@/lib/pending-member-review";

class ReviewError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function POST(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const auth = await requireMobileMember(req);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });
  const { prisma, member: me } = auth;

  const parsed = pendingMemberReviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "欄位格式錯誤" }, { status: 400 });
  const { memberId } = await params;
  let target;
  const pushSettings = await resolveMobilePushSettings();
  try {
    target = await prisma.$transaction(async tx => {
      if (!await tx.member.findFirst({ where: { id: me.id, status: "ACTIVE", deletedAt: null } })) throw new ReviewError(403, "帳號已失效");
      const roles = await tx.adminRole.findMany({ where: { memberId: me.id, role: { in: APPROVER_ROLES }, ...activeAdminRoleWhere() } });
      if (!roles.length) throw new ReviewError(403, "您沒有審核權限");
      const orgIds = await getAdministeredOrganizationIds(tx, roles);
      if (orgIds && !orgIds.length) throw new ReviewError(403, "管理權限尚未設定組織範圍，請聯絡管理者");
      const pending = await tx.member.findFirst({ where: { id: memberId, status: "PENDING", deletedAt: null, ...(orgIds ? { organizationId: { in: orgIds } } : {}) }, include: { organization: { select: { name: true } } } });
      if (!pending) throw new ReviewError(409, "申請狀態或分會已更新，請重新載入");
      assertPendingMemberSnapshot(pending, parsed.data);
      const snapshot = { id: memberId, status: "PENDING", deletedAt: null, organizationId: pending.organizationId, updatedAt: pending.updatedAt };
      if (parsed.data.action === "approve") {
        const dates = approvedPendingMemberJoinDate(pending, parsed.data);
        const changed = await tx.member.updateMany({ where: snapshot, data: { status: "ACTIVE", ...dates } });
        if (changed.count !== 1) throw new ReviewError(409, "此申請已由其他管理者處理");
        const approved = await tx.member.findUniqueOrThrow({ where: { id: memberId }, select: { updatedAt: true } });
        await enqueueMobilePush(tx, { kind: "membership_review", sourceId: memberId, sourceRevision: approved.updatedAt.toISOString(), actorId: me.id, recipientMemberIds: [memberId] }, pushSettings);
        return { ...pending, ...dates };
      } else {
        const history = await Promise.all([
          tx.event.count({ where: { createdById: memberId } }), tx.eventRegistration.count({ where: { memberId } }),
          tx.eventNotification.count({ where: { senderId: memberId } }), tx.adminRole.count({ where: { memberId } }),
          tx.eventCheckInAudit.count({ where: { OR: [{ actorId: memberId }, { memberId }] } }),
          tx.memberOrganizationAssignment.count({ where: { memberId } }),
        ]);
        if (history.some(Boolean)) throw new ReviewError(409, "這筆申請已有活動、報到或權限歷史，不可連帶刪除；請先處理帳號交接。");
        await tx.user.deleteMany({ where: { memberId } });
        const removed = await tx.member.deleteMany({ where: snapshot });
        if (removed.count !== 1) throw new ReviewError(409, "申請內容或分會已更新，請重新載入後再核對。");
        // No push receipt: this rejection removes the recipient's login.
      }
      return pending;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof ReviewError || error instanceof PendingMemberReviewError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error && typeof error === "object" && "code" in error && ["P2034", "P2003", "P2025"].includes(String(error.code))) return NextResponse.json({ error: "資料同時更新或已有關聯歷史，請重新載入確認" }, { status: 409 });
    throw error;
  }
  const approved = parsed.data.action === "approve";
  if (process.env.PASSWORD_RESET_FROM_EMAIL && target.email) await sendSesEmail({
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-northeast-1", from: process.env.PASSWORD_RESET_FROM_EMAIL,
    to: target.email, subject: approved ? "獅子會 App 入會申請已通過" : "獅子會 App 入會申請未通過",
    text: `${target.name} 您好，您加入「${target.organization.name}」的申請${approved ? "已審核通過，現在可以登入使用。" : "未通過審核，如有疑問請聯繫分會幹部。"}`,
  }).catch(() => console.error("Review notification email failed"));
  return NextResponse.json({ ok: true, status: approved ? "ACTIVE" : "REJECTED", ...(approved ? { joinYear: target.joinYear, joinMonth: target.joinMonth } : {}) });
}
