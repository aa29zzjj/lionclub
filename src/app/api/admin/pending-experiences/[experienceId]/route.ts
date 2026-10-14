import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { APPROVER_ROLES, getAdministeredOrganizationIds } from "@/lib/admin-scope";
import { activeAdminRoleWhere } from "@/lib/active-admin-role";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";

const bodySchema = z.object({
  action: z.enum(["verify", "reject"]),
  rejectedReason: z.string().trim().max(500).optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ experienceId: string }> }) {
  if (!isTrustedBrowserMutation(req)) return NextResponse.json({ error: "請從網站操作" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { experienceId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少 action" }, { status: 400 });

  const prisma = await getPrisma();
  const roles = await prisma.adminRole.findMany({
    where: { memberId: me.id, role: { in: APPROVER_ROLES }, ...activeAdminRoleWhere() },
  });
  if (roles.length === 0) return NextResponse.json({ error: "您沒有審核權限" }, { status: 403 });

  const orgIds = await getAdministeredOrganizationIds(prisma, roles);
  if (orgIds && !orgIds.length) return NextResponse.json({ error: "管理權限尚未設定組織範圍，請聯絡管理者" }, { status: 403 });

  const target = await prisma.memberExperience.findUnique({
    where: { id: experienceId },
    include: { member: { select: { organizationId: true } } },
  });
  if (
    !target ||
    target.verificationStatus !== "under_review" ||
    (orgIds && !orgIds.includes(target.member.organizationId))
  ) {
    return NextResponse.json({ error: "找不到此待審核資歷" }, { status: 404 });
  }

  if (parsed.data.expectedUpdatedAt && +new Date(parsed.data.expectedUpdatedAt) !== +target.updatedAt) return NextResponse.json({ error: "資歷內容已由會員更新，請重新載入核對後再審核" }, { status: 409 });
  const guard = { id: experienceId, verificationStatus: "under_review" as const, updatedAt: target.updatedAt,
    member: { status: "ACTIVE" as const, deletedAt: null, ...(orgIds ? { organizationId: { in: orgIds } } : {}) } };

  if (parsed.data.action === "verify") {
    const changed = await prisma.memberExperience.updateMany({
      where: guard,
      data: {
        verificationStatus: "verified",
        verifiedById: me.id,
        verifiedAt: new Date(),
        rejectedReason: null,
      },
    });
    if (!changed.count) return NextResponse.json({ error: "資歷或分會狀態已更新，請重新載入" }, { status: 409 });
    return NextResponse.json({ ok: true, status: "verified" });
  }

  const changed = await prisma.memberExperience.updateMany({
    where: guard,
    data: {
      verificationStatus: "rejected",
      verifiedById: me.id,
      verifiedAt: new Date(),
      rejectedReason: parsed.data.rejectedReason || null,
    },
  });
  if (!changed.count) return NextResponse.json({ error: "資歷或分會狀態已更新，請重新載入" }, { status: 409 });
  return NextResponse.json({ ok: true, status: "rejected" });
}
