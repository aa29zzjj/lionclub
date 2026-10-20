import { NextRequest, NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";
import { assignableRoleNames, canAdministerRoleOrganization, loadRoleAdministrationContext } from "@/lib/admin-scope";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { OnboardingError } from "@/lib/central-onboarding";
import { onboardingErrorResponse } from "@/lib/onboarding-response";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作角色撤銷" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const { roleId } = await params;
  const prisma = await getPrisma();
  try {
    await prisma.$transaction(async tx => {
      const context = await loadRoleAdministrationContext(tx, me.id);
      const role = await tx.adminRole.findUnique({ where: { id: roleId } });
      if (!role?.scopeId || (role.validUntil && role.validUntil <= context.now)) throw new OnboardingError(404, "找不到可撤銷的角色");
      const organization = context.organizations.find(org => org.id === role.scopeId);
      if (!organization || !canAdministerRoleOrganization(context, organization.id)) throw new OnboardingError(403, "沒有此組織的角色配置資格");
      if (role.scopeType !== organization.level || !assignableRoleNames(organization.level).includes(role.role)) throw new OnboardingError(403, "此入口不可撤銷該角色或層級不一致");
      if (role.memberId === me.id) throw new OnboardingError(409, "不能在此撤銷自己的管理角色");
      const changed = await tx.adminRole.updateMany({ where: { id: role.id, role: role.role, scopeId: role.scopeId, scopeType: role.scopeType, validUntil: role.validUntil }, data: { validUntil: context.now } });
      if (changed.count !== 1) throw new OnboardingError(409, "角色已變更，請重新載入");
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") return NextResponse.json({ error: "角色同時更新，請重新載入" }, { status: 409 });
    return onboardingErrorResponse(error);
  }
}
