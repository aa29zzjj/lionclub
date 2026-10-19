import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentMember } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";
import { activeAdminRoleWhere } from "@/lib/active-admin-role";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { REMOVED_EVENT_TITLE } from "@/lib/moderation";

async function isSuperAdmin(prisma: Awaited<ReturnType<typeof getPrisma>>, memberId: string) {
  const now = new Date();
  const role = await prisma.adminRole.findFirst({
    where: { memberId, role: "SUPER_ADMIN", ...activeAdminRoleWhere(now) },
    select: { id: true },
  });
  return Boolean(role);
}

const bodySchema = z.object({
  kind: z.enum(["member", "event"]).default("member"),
  action: z.enum(["review", "dismiss", "suspend", "remove_content"]),
});

class ModerationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const prisma = await getPrisma();
  if (!(await isSuperAdmin(prisma, me.id))) return NextResponse.json({ error: "沒有檢舉審核權限" }, { status: 403 });

  const { reportId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少 action" }, { status: 400 });
  const { kind, action } = parsed.data;
  if ((kind === "member" && action === "remove_content") || (kind === "event" && action === "suspend")) {
    return NextResponse.json({ error: "此處置不適用於這類檢舉" }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      if (kind === "member") {
        const report = await tx.memberReport.findUnique({ where: { id: reportId } });
        if (!report || report.status !== "PENDING") throw new ModerationError(404, "找不到待處理的檢舉");
        if (action === "suspend") {
          if (report.targetId === me.id) throw new ModerationError(400, "不能停權自己");
          const target = await tx.member.findUnique({ where: { id: report.targetId }, select: { status: true } });
          if (!target) throw new ModerationError(404, "找不到被檢舉的會員");
          if (await tx.adminRole.findFirst({ where: { memberId: report.targetId, ...activeAdminRoleWhere(now) }, select: { id: true } })) {
            throw new ModerationError(409, "此會員仍持有有效的管理角色，請先撤銷角色再停權");
          }
          await tx.member.update({ where: { id: report.targetId }, data: { status: "SUSPENDED" } });
          // Existing sessions already fail (inactive members are rejected), this also invalidates the tokens.
          await tx.user.updateMany({ where: { memberId: report.targetId }, data: { sessionVersion: { increment: 1 } } });
        }
        await tx.memberReport.update({
          where: { id: reportId },
          data: { status: action === "dismiss" ? "DISMISSED" : "REVIEWED", reviewedById: me.id, reviewedAt: now },
        });
        return;
      }

      const report = await tx.eventReport.findUnique({ where: { id: reportId } });
      if (!report || report.status !== "PENDING") throw new ModerationError(404, "找不到待處理的檢舉");
      if (action === "remove_content") {
        if (!report.eventId) throw new ModerationError(404, "活動已不存在");
        // Strip the offending content but keep the event row, registrations and audit history intact.
        await tx.event.update({ where: { id: report.eventId }, data: { title: REMOVED_EVENT_TITLE, description: null, coverPhotoUrl: null, location: null } });
      }
      await tx.eventReport.update({
        where: { id: reportId },
        data: { status: action === "dismiss" ? "DISMISSED" : action === "remove_content" ? "CONTENT_REMOVED" : "REVIEWED", reviewedById: me.id, reviewedAt: now },
      });
    });
  } catch (error) {
    if (error instanceof ModerationError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  return NextResponse.json({ ok: true });
}
