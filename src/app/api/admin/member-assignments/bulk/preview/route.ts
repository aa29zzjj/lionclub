import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { getAssignmentScope } from "@/lib/central-onboarding";
import { onboardingErrorResponse } from "@/lib/onboarding-response";

const rowSchema = z.object({ email: z.string().trim().email(), organizationId: z.string().trim().min(1) });
const bodySchema = z.object({ rows: z.array(rowSchema).min(1).max(200) });

export async function POST(request: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });

  try {
    const prisma = await getPrisma();
    const scope = await getAssignmentScope(prisma, me.id);

    const rows = await Promise.all(
      parsed.data.rows.map(async (row) => {
        const member = await prisma.member.findFirst({
          where: { email: { equals: row.email, mode: "insensitive" }, status: "ACTIVE" },
          select: {
            id: true, name: true, organizationId: true, organizationAssignmentStatus: true,
            organizationAssignmentVersion: true, organization: { select: { id: true, name: true } },
          },
        });
        if (!member) return { ...row, error: "找不到此 Email 對應的啟用會員" };
        if (scope && !scope.includes(member.organizationId)) return { ...row, error: "此會員的目前分會超出您的管理範圍" };
        if (scope && !scope.includes(row.organizationId)) return { ...row, error: "目標分會超出您的管理範圍" };

        const targetOrg = await prisma.organization.findFirst({
          where: { id: row.organizationId, level: "club", isActive: true },
          select: { id: true, name: true },
        });
        if (!targetOrg) return { ...row, error: "目標分會不存在或未啟用" };
        if (member.organizationId === targetOrg.id && member.organizationAssignmentStatus === "ASSIGNED") {
          return { ...row, error: "已是目前分會，無須異動" };
        }

        return {
          ...row,
          memberId: member.id,
          memberName: member.name,
          currentOrganizationId: member.organization.id,
          currentOrganizationName: member.organization.name,
          targetOrganizationName: targetOrg.name,
          expectedAssignmentVersion: member.organizationAssignmentVersion,
        };
      })
    );

    return NextResponse.json({ rows });
  } catch (error) {
    return onboardingErrorResponse(error);
  }
}
