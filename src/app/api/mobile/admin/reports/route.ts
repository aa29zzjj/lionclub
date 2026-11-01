import { NextRequest, NextResponse } from "next/server";
import { requireMobileMember } from "@/lib/mobile-request-auth";
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

export async function GET(req: NextRequest) {
  const auth = await requireMobileMember(req);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });
  const { prisma, member: me } = auth;

  if (!(await isSuperAdmin(prisma, me.id))) return NextResponse.json({ error: "沒有檢舉審核權限" }, { status: 403 });

  const [reports, eventReports] = await Promise.all([
    prisma.memberReport.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        target: { select: { id: true, name: true, email: true, status: true } },
      },
    }),
    prisma.eventReport.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        event: { select: { id: true, title: true, description: true, createdBy: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  return NextResponse.json({ reports, eventReports });
}
