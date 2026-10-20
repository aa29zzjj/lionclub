import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assignableRoleNames, canAdministerRoleOrganization, CLUB_ASSIGNABLE_ROLES, DISTRICT_REVIEW_ASSIGNABLE_ROLES, loadRoleAdministrationContext, MAX_REVIEW_GRANT_DAYS, roleMemberOrganizationIds } from "@/lib/admin-scope";
import { getCurrentMember } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";
import { OnboardingError } from "@/lib/central-onboarding";
import { onboardingErrorResponse } from "@/lib/onboarding-response";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";

export async function GET(request: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const prisma = await getPrisma();
  const result = await prisma.$transaction(async tx => {
    const context = await loadRoleAdministrationContext(tx, me.id);
    const organizations = context.organizations.filter(org => canAdministerRoleOrganization(context, org.id)).map(org => ({ id: org.id, name: org.name, level: org.level, districtCode: org.districtCode })).sort((a, b) => a.name.localeCompare(b.name, "zh-TW"));
    const requested = request.nextUrl.searchParams.get("organizationId");
    const organization = requested ? organizations.find(org => org.id === requested) : organizations.find(org => org.id === me.organizationId) ?? organizations[0];
    if (!organization) return null;
    const assignableRoles = assignableRoleNames(organization.level);
    const eligibleOrganizationIds = roleMemberOrganizationIds(context, organization.id);
    const managedGrantWhere = { scopeId: organization.id, scopeType: organization.level, role: { in: [...assignableRoles] }, OR: [{ validUntil: null }, { validUntil: { gt: context.now } }] };
    const members = await tx.member.findMany({
      where: { OR: [{ organizationId: { in: eligibleOrganizationIds }, status: "ACTIVE", deletedAt: null }, { adminRoles: { some: managedGrantWhere } }] }, orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, title: true, organizationId: true, status: true, deletedAt: true, adminRoles: { where: managedGrantWhere, select: { id: true, role: true, validFrom: true, validUntil: true } } },
    });
    return { organizations, organization, members: members.map(({ organizationId, status, deletedAt, ...member }) => {
      const eligibleForGrant = eligibleOrganizationIds.includes(organizationId) && status === "ACTIVE" && !deletedAt;
      return { ...member, email: eligibleForGrant ? member.email : null, title: eligibleForGrant ? member.title : null, eligibleForGrant };
    }), assignableRoles };
  }, { isolationLevel: "RepeatableRead" });
  return result ? NextResponse.json(result, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "沒有此組織的角色配置資格；區級審核角色僅限有效 GLOBAL SUPER 手動配置" }, { status: 403 });
}

const createSchema = z.object({
  organizationId: z.string().trim().min(1).max(200), memberId: z.string().trim().min(1).max(200),
  role: z.enum([...CLUB_ASSIGNABLE_ROLES, ...DISTRICT_REVIEW_ASSIGNABLE_ROLES]),
  validUntil: z.string().datetime().optional(),
}).strict();

export async function POST(request: NextRequest) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作角色配置" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "欄位格式錯誤，請確認角色與有效期限" }, { status: 400 });
  const prisma = await getPrisma();
  try {
    const role = await prisma.$transaction(async tx => {
      const context = await loadRoleAdministrationContext(tx, me.id);
      const organization = context.organizations.find(org => org.id === parsed.data.organizationId);
      if (!organization || !canAdministerRoleOrganization(context, organization.id)) throw new OnboardingError(403, "沒有此組織的角色配置資格");
      if (!assignableRoleNames(organization.level).includes(parsed.data.role)) throw new OnboardingError(400, "角色必須與授權組織層級一致");
      if (parsed.data.memberId === me.id) throw new OnboardingError(409, "不可在此授予自己角色，請由另一位有效授權者核對");
      const validUntil = parsed.data.validUntil ? new Date(parsed.data.validUntil) : null;
      if (validUntil && validUntil <= context.now) throw new OnboardingError(400, "有效期限必須晚於現在");
      if (organization.level === "district" && (!validUntil || +validUntil > +context.now + MAX_REVIEW_GRANT_DAYS * 86_400_000)) throw new OnboardingError(400, "區級資歷審核授權須有明確期限，最長 366 日，不自動續期");
      const target = await tx.member.findFirst({ where: { id: parsed.data.memberId, organizationId: { in: roleMemberOrganizationIds(context, organization.id) }, status: "ACTIVE", deletedAt: null }, select: { id: true } });
      if (!target) throw new OnboardingError(404, "找不到此範圍內的啟用會員");
      const existing = await tx.adminRole.findFirst({ where: { memberId: target.id, role: parsed.data.role, scopeType: organization.level, scopeId: organization.id, OR: [{ validUntil: null }, { validUntil: { gt: context.now } }] } });
      if (existing) throw new OnboardingError(409, "此會員已有相同有效或待生效角色");
      return tx.adminRole.create({ data: { memberId: target.id, role: parsed.data.role, scopeType: organization.level, scopeId: organization.id, validFrom: context.now, validUntil, grantedById: me.id } });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ role }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") return NextResponse.json({ error: "會籍或權限同時更新，請重新載入後操作" }, { status: 409 });
    return onboardingErrorResponse(error);
  }
}
