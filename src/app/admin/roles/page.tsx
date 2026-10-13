"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";

type Role = { id: string; role: string; validFrom: string };
type Member = { id: string; name: string; email: string | null; title: string | null; adminRoles: Role[] };
type Organization = { id: string; name: string; districtCode: string | null };
type AssignableRole = "CLUB_OFFICER" | "CLUB_FINANCE" | "CLUB_VICE_PRESIDENT" | "CLUB_PRESIDENT";

const roleLabels: Record<AssignableRole, string> = {
  CLUB_OFFICER: "分會幹部",
  CLUB_FINANCE: "分會財務",
  CLUB_VICE_PRESIDENT: "分會副會長",
  CLUB_PRESIDENT: "分會會長",
};

export default function AdminRolesPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState("");
  const [role, setRole] = useState<AssignableRole>("CLUB_OFFICER");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (organizationId?: string) => {
    setLoading(true);
    setError("");
    const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
    const response = await fetch(`/api/admin/roles${query}`, { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/login");
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
    setMemberId((current) => result.members?.some((member: Member) => member.id === current)
      ? current
      : result.members?.[0]?.id ?? "");
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function grant(event: React.FormEvent) {
    event.preventDefault();
    if (!organization) return;
    setSaving(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: organization.id, memberId, role }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "授權失敗");
      setSaving(false);
      return;
    }
    setNotice(`已授予${roleLabels[role]}權限`);
    await load(organization.id);
    setSaving(false);
  }

  async function revoke(roleId: string) {
    if (!organization || !window.confirm("確定撤銷這項系統管理權限嗎？")) return;
    setError("");
    setNotice("");
    const response = await fetch(`/api/admin/roles/${roleId}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "撤銷失敗");
      return;
    }
    setNotice("權限已撤銷");
    await load(organization.id);
  }

  const activeRoleCount = members.reduce((count, member) => count + member.adminRoles.length, 0);

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-8">
        <h1 className="text-xl font-bold">幹部系統權限</h1>
        <p className="mt-1 text-xs text-lion-muted">管理範圍依登入者的分會、區或複合區權限自動限制</p>

        {organizations.length > 1 && (
          <div className="mt-5">
            <label htmlFor="managed-organization" className="mb-1 block text-xs text-lion-muted">管理分會</label>
            <select
              id="managed-organization"
              value={organization?.id ?? ""}
              onChange={(event) => void load(event.target.value)}
              disabled={loading}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-lion-gold disabled:opacity-50"
            >
              {organizations.map((item) => (
                <option key={item.id} value={item.id} className="bg-lion-card text-lion-cream">
                  {item.districtCode ? `${item.districtCode} · ` : ""}{item.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {organization && organizations.length <= 1 && (
          <p className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-xs text-lion-muted">
            {organization.districtCode ? `${organization.districtCode} · ` : ""}{organization.name}
          </p>
        )}

        {loading ? <p className="py-12 text-center text-sm text-lion-muted">載入中…</p> : <>
          <form onSubmit={grant} className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-lion-card p-4">
            <div>
              <label htmlFor="role-member" className="mb-1 block text-xs text-lion-muted">會員</label>
              <select id="role-member" value={memberId} onChange={(event) => setMemberId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm">
                {members.map((member) => <option key={member.id} value={member.id} className="bg-lion-card text-lion-cream">{member.name}{member.email ? ` · ${member.email}` : ""}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="role-type" className="mb-1 block text-xs text-lion-muted">系統權限</label>
              <select id="role-type" value={role} onChange={(event) => setRole(event.target.value as AssignableRole)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm">
                {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value} className="bg-lion-card text-lion-cream">{label}</option>)}
              </select>
            </div>
            <button type="submit" disabled={!memberId || !organization || saving} className="rounded-xl bg-lion-action py-2.5 text-sm font-semibold text-lion-navyDeep disabled:opacity-40">
              {saving ? "處理中…" : "授予權限"}
            </button>
          </form>

          {notice && <p className="mt-3 rounded-xl border border-lion-gold/30 bg-lion-gold/10 px-3 py-2 text-sm text-lion-gold">{notice}</p>}
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

          <div className="mt-6 flex items-center justify-between">
            <h2 className="text-sm font-semibold">現有權限</h2>
            <span className="text-xs text-lion-muted">共 {activeRoleCount} 項</span>
          </div>
          <div className="mt-3 flex flex-col gap-3">
            {members.flatMap((member) => member.adminRoles.map((adminRole) => (
              <div key={adminRole.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-lion-card p-3">
                <div>
                  <p className="text-sm font-medium">{member.name}</p>
                  <p className="text-xs text-lion-muted">{roleLabels[adminRole.role as AssignableRole] ?? adminRole.role}{member.title ? ` · ${member.title}` : ""}</p>
                </div>
                <button onClick={() => void revoke(adminRole.id)} className="shrink-0 rounded-lg border border-red-300/20 px-2.5 py-1.5 text-xs text-red-300">撤銷</button>
              </div>
            )))}
            {activeRoleCount === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-lion-muted">
                此分會目前沒有可管理的幹部權限
              </div>
            )}
          </div>
        </>}
      </div>
    </AppShell>
  );
}
