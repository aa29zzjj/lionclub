import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentMember } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";
import { activeAdminRoleWhere } from "@/lib/active-admin-role";

async function isSuperAdmin(prisma: Awaited<ReturnType<typeof getPrisma>>, memberId: string) {
  const now = new Date();
  const role = await prisma.adminRole.findFirst({
    where: { memberId, role: "SUPER_ADMIN", ...activeAdminRoleWhere(now) },
    select: { id: true },
  });
  return Boolean(role);
}

const bodySchema = z.object({ action: z.enum(["review", "dismiss"]) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const prisma = await getPrisma();
  if (!(await isSuperAdmin(prisma, me.id))) return NextResponse.json({ error: "沒有檢舉審核權限" }, { status: 403 });

  const { reportId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少 action" }, { status: 400 });

  const report = await prisma.memberReport.findUnique({ where: { id: reportId } });
  if (!report || report.status !== "PENDING") return NextResponse.json({ error: "找不到待處理的檢舉" }, { status: 404 });

  await prisma.memberReport.update({
    where: { id: reportId },
    data: {
      status: parsed.data.action === "review" ? "REVIEWED" : "DISMISSED",
      reviewedById: me.id,
      reviewedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
