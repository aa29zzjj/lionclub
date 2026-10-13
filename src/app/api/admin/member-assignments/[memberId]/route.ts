import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { assignmentSchema, assignmentMemberSelect, assignMemberOrganization, getAssignmentScope } from "@/lib/central-onboarding";
import { onboardingErrorResponse } from "@/lib/onboarding-response";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });
  try {
    const prisma = await getPrisma();
    const scope = await getAssignmentScope(prisma, me.id);
    const { memberId } = await params;
    const now = new Date();
    const member = await prisma.member.findFirst({
      where: { id: memberId, ...(scope ? { organizationId: { in: scope } } : {}) },
      select: { ...assignmentMemberSelect, adminRoles: { where: { validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }] }, select: { role: true, scopeId: true } } },
    });
    if (!member) return NextResponse.json({ error: "找不到可管理的會員" }, { status: 404 });
    const history = await prisma.memberOrganizationAssignment.findMany({ where: { memberId },
      select: { id: true, fromOrganizationName: true, toOrganizationName: true, reason: true, assignedAt: true,
        assignedBy: { select: { name: true } }, revokedRoleNames: true, revokedInviteCount: true },
      orderBy: [{ assignedAt: "desc" }, { id: "desc" }], take: 100 });
    return NextResponse.json({ member, history }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onboardingErrorResponse(error); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作分派" }, { status: 403 });
  const parsed = assignmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "欄位格式錯誤" }, { status: 400 });
  try {
    const { memberId } = await params;
    return NextResponse.json(await assignMemberOrganization(await getPrisma(), me.id, memberId, parsed.data));
  } catch (error) { return onboardingErrorResponse(error); }
}
