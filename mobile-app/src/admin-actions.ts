import type { PendingExperience, RolesResponse } from "./contract";

export const ADMIN_ROLE_LABELS: Record<string, string> = {
  CLUB_OFFICER: "分會幹部",
  CLUB_FINANCE: "分會財務",
  CLUB_VICE_PRESIDENT: "分會副會長",
  CLUB_PRESIDENT: "分會會長",
  DISTRICT_GOVERNOR: "區總監（資歷審核專用）",
  DISTRICT_SECRETARY: "區秘書長（資歷審核專用）",
  DISTRICT_CABINET: "區內閣（不含 GMT 專用審核授權）",
  DISTRICT_GMT_COORDINATOR: "GMT 協調長（直屬專區主席資歷審核專用）",
};

// These checks only narrow the server-provided choices. The API rechecks all authority.
export function grantableRoles(data: RolesResponse) {
  const prefix = data.organization.level === "club" ? "CLUB_" : data.organization.level === "district" ? "DISTRICT_" : null;
  return data.assignableRoles.filter(role => prefix && role.startsWith(prefix) && Object.hasOwn(ADMIN_ROLE_LABELS, role));
}

export function grantableMembers(data: RolesResponse, actorId: string) {
  return data.members.filter(member => member.eligibleForGrant === true && member.id !== actorId);
}

export function existingRoleGrants(data: RolesResponse) {
  // Ineligible members can still hold a grant which the manager must be able to revoke.
  return data.members.flatMap(member => member.adminRoles.map(grant => ({ member, grant })));
}

export type RoleGrantDraft = { organizationId: string; memberId: string; role: string; validUntilDate: string };

export function validateRoleGrant(data: RolesResponse, actorId: string, draft: RoleGrantDraft, now = Date.now()) {
  if (draft.organizationId !== data.organization.id || !data.organizations.some(org => org.id === draft.organizationId)) {
    throw new Error("授權組織已變更，請重新載入後確認。");
  }
  const member = grantableMembers(data, actorId).find(entry => entry.id === draft.memberId);
  if (!member) throw new Error("請選擇此範圍內可授權的其他啟用會員。");
  if (!grantableRoles(data).includes(draft.role)) throw new Error("請選擇此組織允許的系統權限。");
  if (member.adminRoles.some(grant => grant.role === draft.role)) throw new Error("此會員已有相同有效或待生效角色。");
  let validUntil: string | undefined;
  if (draft.validUntilDate) {
    // Use the same inclusive Taiwan date as the web form, independent of device timezone.
    const date = new Date(`${draft.validUntilDate}T23:59:59.999+08:00`);
    const calendarDate = Number.isFinite(+date) ? new Date(+date + 8 * 3_600_000).toISOString().slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.validUntilDate) || calendarDate !== draft.validUntilDate) throw new Error("請確認有效期限日期。");
    if (+date <= now) throw new Error("有效期限必須晚於現在。");
    validUntil = date.toISOString();
  }
  if (data.organization.level === "district" && (!validUntil || Date.parse(validUntil) > now + 366 * 86_400_000)) {
    throw new Error("區級資歷審核角色須有明確期限，最長 366 日，不自動續期。");
  }
  return { organizationId: draft.organizationId, memberId: member.id, role: draft.role, validUntil };
}

export function validateRoleRevoke(data: RolesResponse, actorId: string, organizationId: string, roleId: string) {
  const entry = existingRoleGrants(data).find(({ grant }) => grant.id === roleId);
  if (data.organization.id !== organizationId || !entry || !grantableRoles(data).includes(entry.grant.role)) throw new Error("角色或組織已變更，請重新載入。");
  if (entry.member.id === actorId) throw new Error("不能在此撤銷自己的管理角色。");
  return entry;
}

export function validateExperienceReview(item: PendingExperience, action: "verify" | "reject", rawReason: string, expectedUpdatedAt = item.updatedAt) {
  if (!expectedUpdatedAt || expectedUpdatedAt !== item.updatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) throw new Error("資歷版本已變更，請重新載入後確認。");
  const reason = rawReason.trim();
  if ((action === "reject" || item.review.requiresReason) && reason.length < 2) throw new Error("退回或例外核實，請填寫至少 2 字的具體理由／證明來源。");
  if (reason.length > 1000) throw new Error("審核理由不可超過 1,000 字。");
  return { id: item.id, action, expectedUpdatedAt, reason: reason || undefined };
}

export function createAdminRequestGuard() {
  let generation = 0;
  return { begin: () => ++generation, isCurrent: (request: number) => request === generation, invalidate: () => { generation++; } };
}
