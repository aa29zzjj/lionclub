"use client";

import { organizationDisplayName } from "@/lib/organization-label";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";

type Role = { id: string; role: string; validFrom: string; validUntil?: string | null };
type Member = { id: string; name: string; email: string | null; title: string | null; adminRoles: Role[]; eligibleForGrant?: boolean };
type Organization = { id: string; name: string; districtCode: string | null; level?: string };
type AssignableRole = "CLUB_OFFICER" | "CLUB_FINANCE" | "CLUB_VICE_PRESIDENT" | "CLUB_PRESIDENT" | "DISTRICT_GOVERNOR" | "DISTRICT_SECRETARY" | "DISTRICT_CABINET" | "DISTRICT_GMT_COORDINATOR";

const roleLabels: Record<AssignableRole, string> = {
  CLUB_OFFICER: "分會幹部",
  CLUB_FINANCE: "分會財務",
  CLUB_VICE_PRESIDENT: "分會副會長",
  CLUB_PRESIDENT: "分會會長",
  DISTRICT_GOVERNOR: "區總監（資歷審核專用）",
  DISTRICT_SECRETARY: "區秘書長（資歷審核專用）",
  DISTRICT_CABINET: "區內閣（不含 GMT 專用審核授權）",
  DISTRICT_GMT_COORDINATOR: "GMT 協調長（直屬專區主席資歷審核專用）",
};

export default function AdminRolesPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState("");
  const [role, setRole] = useState<AssignableRole>("CLUB_OFFICER");
  const [assignableRoles, setAssignableRoles] = useState<AssignableRole[]>([]);
  const [validUntilDate, setValidUntilDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (organizationId?: string) => {
    setLoading(true);
    setError("");
    const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
    try {
    const response = await fetch(`/api/admin/roles${query}`, { cache: "no-store" });
    if (response.status === 401) {
      setMembers([]); router.replace("/login?reason=session-expired");
      return;
    }
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "無法讀取幹部權限");
      setMembers([]);
      setLoading(false);
      return;
    }
    setOrganizations(result.organizations ?? []);
    setOrganization(result.organization ?? null);
    setMembers(result.members ?? []);
    const allowed = (Array.isArray(result.assignableRoles) ? result.assignableRoles : []).filter((value: string): value is AssignableRole => Object.hasOwn(roleLabels, value));
    setAssignableRoles(allowed);
    setRole(current => allowed.includes(current) ? current : allowed[0] ?? "CLUB_OFFICER");
    setMemberId((current) => result.members?.some((member: Member) => member.id === current && member.eligibleForGrant !== false)
      ? current
      : result.members?.find((member: Member) => member.eligibleForGrant !== false)?.id ?? "");
    setLoading(false);
    } catch { setError("幹部名單連線中斷，請重新載入"); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function grant(event: React.FormEvent) {
    event.preventDefault();
    if (!organization || saving || !assignableRoles.includes(role)) return;
    if (organization.level === "district" && !validUntilDate) { setError("區級審核角色必須填寫有效期限，最長 366 日"); return; }
    const validUntil = validUntilDate ? new Date(`${validUntilDate}T23:59:59.999+08:00`) : null;
    if (validUntil && !Number.isFinite(+validUntil)) { setError("請確認有效期限日期"); return; }
    const target = members.find(member => member.id === memberId);
    if (!window.confirm(`確定手動授予 ${target?.name ?? "此會員"} 在 ${organization.name} 的「${roleLabels[role]}」嗎？${validUntilDate ? `有效至 ${validUntilDate}（台灣時間）。` : ""}此操作是系統授權，不會核實其自填資歷，也不會自動續期。`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
    const response = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: organization.id, memberId, role, validUntil: validUntil?.toISOString() }),
    });
    const result = await response.json();
    if (response.status === 401) { setMembers([]); router.replace("/login?reason=session-expired"); return; }
    if (!response.ok) {
      setError(result.error ?? "授權失敗");
      setSaving(false);
      return;
    }
    setNotice(`已授予${roleLabels[role]}權限`);
    await load(organization.id);
    setSaving(false);
    } catch { setError("連線中斷，請重新載入確認授權結果後再試"); }
    finally { setSaving(false); }
  }

  async function revoke(roleId: string) {
    const target = members.find((member) => member.adminRoles.some((adminRole) => adminRole.id === roleId));
    if (!organization || saving || !window.confirm(`確定撤銷 ${target?.name ?? "此會員"} 在 ${organization.name} 的這項系統管理權限嗎？`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
    const response = await fetch(`/api/admin/roles/${roleId}`, { method: "DELETE" });
    const result = await response.json();
    if (response.status === 401) { setMembers([]); router.replace("/login?reason=session-expired"); return; }
    if (!response.ok) {
      setError(result.error ?? "撤銷失敗");
      return;
    }
    setNotice("權限已撤銷");
    await load(organization.id);
    } catch { setError("連線中斷，請重新載入確認撤銷結果後再試"); }
    finally { setSaving(false); }
  }

  const activeRoleCount = members.reduce((count, member) => count + member.adminRoles.length, 0);

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-8">
        <h1 className="text-xl font-bold">幹部與審核系統角色</h1>
        <p className="mt-1 text-sm text-lion-muted">分會角色依有效管理範圍限制。區級資歷審核角色只有有效 GLOBAL SUPER 可手動配置，不提供授予 SUPER 的入口。</p>

        {organizations.length > 1 && (
          <div className="mt-5">
            <label htmlFor="managed-organization" className="mb-1 block text-sm text-lion-muted">授權組織／精確範圍</label>
            <select
              id="managed-organization"
              value={organization?.id ?? ""}
              onChange={(event) => { setValidUntilDate(""); void load(event.target.value); }}
              disabled={loading || saving}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-lion-gold disabled:opacity-50"
            >
              {organizations.map((item) => (
                <option key={item.id} value={item.id} className="bg-lion-card text-lion-cream">
                  {item.districtCode && !item.name.includes(item.districtCode) ? `${item.districtCode} · ` : ""}{organizationDisplayName(item)}
                </option>
              ))}
            </select>
          </div>
        )}

        {organization && organizations.length <= 1 && (
          <p className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-xs text-lion-muted">
            {organization.districtCode && !organization.name.includes(organization.districtCode) ? `${organization.districtCode} · ` : ""}{organizationDisplayName(organization)}
          </p>
        )}

        {loading ? <p className="py-12 text-center text-sm text-lion-muted">載入中…</p> : <>
          <form onSubmit={grant} className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-lion-card p-4">
            <fieldset disabled={saving || !organization} className="flex min-w-0 flex-col gap-3">
            <div>
              <label htmlFor="role-member" className="mb-1 block text-xs text-lion-muted">會員</label>
              <select id="role-member" value={memberId} onChange={(event) => setMemberId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm">
                {members.filter(member => member.eligibleForGrant !== false).map((member) => <option key={member.id} value={member.id} className="bg-lion-card text-lion-cream">{member.name}{member.email ? ` · ${member.email}` : ""}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="role-type" className="mb-1 block text-xs text-lion-muted">系統權限</label>
              <select id="role-type" value={role} onChange={(event) => setRole(event.target.value as AssignableRole)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm">
                {assignableRoles.map(value => <option key={value} value={value} className="bg-lion-card text-lion-cream">{roleLabels[value]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="role-valid-until" className="mb-1 block text-base">有效至（台灣日期含當日，{organization?.level === "district" ? "必填" : "選填"}）</label>
              <input id="role-valid-until" type="date" value={validUntilDate} required={organization?.level === "district"} onChange={event => setValidUntilDate(event.target.value)} className="min-h-12 w-full rounded-xl border border-lion-border bg-lion-page px-3 py-3 text-base" />
              {organization?.level === "district" && <p className="mt-2 text-sm text-lion-muted">區級資歷審核權限最長 366 日，不自動續期；GMT 專用角色不包含會員異動、邀請或官方活動發布權。GLT／GST 不能借用此角色。</p>}
            </div>
            <button type="submit" disabled={!memberId || !organization || !assignableRoles.includes(role) || saving} className="min-h-12 rounded-xl bg-lion-action py-2.5 text-base font-semibold text-lion-navyDeep disabled:opacity-40">
              {saving ? "處理中…" : "授予權限"}
            </button>
            </fieldset>
          </form>

          {notice && <p role="status" className="mt-3 rounded-xl border border-lion-border bg-lion-card px-3 py-3 text-base">{notice}</p>}
          {error && <div className="mt-3"><p role="alert" className="text-base text-lion-danger">{error}</p><button type="button" disabled={saving} onClick={() => void load(organization?.id)} className="mt-2 min-h-12 rounded-xl border border-lion-border px-3 text-sm">重新載入權限</button></div>}

          <div className="mt-6 flex items-center justify-between">
            <h2 className="text-sm font-semibold">現有權限</h2>
            <span className="text-xs text-lion-muted">共 {activeRoleCount} 項</span>
          </div>
          <div className="mt-3 flex flex-col gap-3">
            {members.flatMap((member) => member.adminRoles.map((adminRole) => (
              <div key={adminRole.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-lion-card p-3">
                <div>
                  <p className="text-sm font-medium">{member.name}</p>
                  <p className="text-sm text-lion-muted">{roleLabels[adminRole.role as AssignableRole] ?? adminRole.role}{member.title ? ` · 自填職稱：${member.title}` : ""}</p>
                  <p className="mt-1 text-sm text-lion-muted">{new Date(adminRole.validFrom).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })} 起，{adminRole.validUntil ? `至 ${new Date(adminRole.validUntil).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}` : "未設定到期日（既有角色）"}</p>
                  {member.eligibleForGrant === false && <p className="mt-1 text-sm text-lion-danger">目前不在可新增授權的啟用會員範圍，既有角色仍可核對撤銷。</p>}
                </div>
                <button disabled={saving} onClick={() => void revoke(adminRole.id)} className="shrink-0 rounded-lg border border-lion-border px-2.5 py-1.5 text-sm text-lion-danger disabled:opacity-50">撤銷</button>
              </div>
            )))}
            {activeRoleCount === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-lion-muted">
                此組織目前沒有可管理的角色
              </div>
            )}
          </div>
        </>}
      </div>
    </AppShell>
  );
}
