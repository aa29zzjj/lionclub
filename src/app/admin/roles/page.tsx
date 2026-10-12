"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";

type Role = { id: string; role: string; validFrom: string };
type Member = { id: string; name: string; email: string | null; title: string | null; adminRoles: Role[] };

const roleLabels: Record<string, string> = {
  CLUB_OFFICER: "分會幹部",
  CLUB_FINANCE: "分會財務",
  CLUB_PRESIDENT: "分會會長",
};

export default function AdminRolesPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [organizationName, setOrganizationName] = useState("");
  const [memberId, setMemberId] = useState("");
  const [role, setRole] = useState<"CLUB_OFFICER" | "CLUB_FINANCE">("CLUB_OFFICER");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/admin/roles", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/login");
      return;
    }
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "無法讀取幹部權限");
      return;
    }
    setMembers(result.members ?? []);
    setOrganizationName(result.organization?.name ?? "");
    setMemberId((current) => current || result.members?.[0]?.id || "");
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function grant(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, role }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "授權失敗");
      return;
    }
    await load();
  }

  async function revoke(roleId: string) {
    if (!window.confirm("確定撤銷這項系統管理權限嗎？")) return;
    const response = await fetch(`/api/admin/roles/${roleId}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "撤銷失敗");
      return;
    }
    await load();
  }

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-8">
        <h1 className="text-xl font-bold">幹部系統權限</h1>
        <p className="mt-1 text-xs text-lion-muted">{organizationName || "本分會"} · 此權限與個人資歷／職稱分開</p>
        {loading ? <p className="py-12 text-center text-sm text-lion-muted">載入中…</p> : <>
          <form onSubmit={grant} className="mt-5 rounded-2xl border border-white/10 bg-lion-card p-4 flex flex-col gap-3">
            <select value={memberId} onChange={(event) => setMemberId(event.target.value)} className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm">
              {members.map((member) => <option key={member.id} value={member.id} className="text-black">{member.name}{member.email ? ` · ${member.email}` : ""}</option>)}
            </select>
            <select value={role} onChange={(event) => setRole(event.target.value as typeof role)} className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm">
              <option value="CLUB_OFFICER" className="text-black">分會幹部</option>
              <option value="CLUB_FINANCE" className="text-black">分會財務</option>
            </select>
            <button type="submit" disabled={!memberId} className="rounded-xl bg-lion-gold py-2.5 text-sm font-semibold text-lion-navyDeep disabled:opacity-40">授予權限</button>
          </form>
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          <div className="mt-5 flex flex-col gap-3">
            {members.map((member) => member.adminRoles.map((adminRole) => (
              <div key={adminRole.id} className="rounded-xl border border-white/[0.06] bg-lion-card p-3 flex items-center justify-between gap-3">
                <div><p className="text-sm font-medium">{member.name}</p><p className="text-xs text-lion-muted">{roleLabels[adminRole.role] ?? adminRole.role}</p></div>
                {adminRole.role !== "CLUB_PRESIDENT" && <button onClick={() => revoke(adminRole.id)} className="text-xs text-red-300">撤銷</button>}
              </div>
            )))}
          </div>
        </>}
      </div>
    </AppShell>
  );
}
