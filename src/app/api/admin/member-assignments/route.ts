import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { assignmentMemberSelect, getAssignmentScope } from "@/lib/central-onboarding";
import { onboardingErrorResponse } from "@/lib/onboarding-response";

const querySchema = z.object({
  status: z.enum(["NEEDS_ASSIGNMENT", "ASSIGNED", "ALL"]).default("NEEDS_ASSIGNMENT"),
  q: z.string().trim().max(100).default(""), page: z.coerce.number().int().min(1).max(100000).default(1),
});

export async function GET(request: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "查詢格式錯誤" }, { status: 400 });
  try {
    const prisma = await getPrisma();
    const scope = await getAssignmentScope(prisma, me.id);
    const { status, q, page } = parsed.data;
    const pageSize = 30;
    const where: Prisma.MemberWhereInput = {
      id: { not: me.id },
      status: "ACTIVE", ...(scope ? { organizationId: { in: scope } } : {}),
      ...(status === "ALL" ? {} : { organizationAssignmentStatus: status }),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
    };
    const [members, total, organizations] = await Promise.all([
      prisma.member.findMany({ where, select: assignmentMemberSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.member.count({ where }),
      prisma.organization.findMany({ where: { level: "club", isActive: true, ...(scope ? { id: { in: scope } } : {}) }, select: { id: true, name: true, districtCode: true }, orderBy: [{ districtCode: "asc" }, { name: "asc" }] }),
    ]);
    return NextResponse.json({ members, organizations, canAssignAcrossAllClubs: scope === undefined,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onboardingErrorResponse(error); }
}
