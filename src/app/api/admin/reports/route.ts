import { NextResponse } from "next/server";
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

export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const prisma = await getPrisma();
  if (!(await isSuperAdmin(prisma, me.id))) return NextResponse.json({ error: "沒有檢舉審核權限" }, { status: 403 });

  const reports = await prisma.memberReport.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      reporter: { select: { id: true, name: true, email: true } },
      target: { select: { id: true, name: true, email: true, status: true } },
    },
  });

  return NextResponse.json({ reports });
}
