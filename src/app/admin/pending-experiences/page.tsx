"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { formatLionsYear, type MemberExperience } from "@/lib/experience-data";

type PendingExperience = MemberExperience & {
  id: string;
  positionName: string;
  organizationName: string;
  startYear: number;
  endYear?: number;
  isCurrent: boolean;
  note?: string;
  updatedAt: string;
  member: { id: string; name: string; organization: { name: string } };
};

export default function PendingExperiencesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [experiences, setExperiences] = useState<PendingExperience[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});

  function load() {
    setLoading(true); setError("");
    return fetch("/api/admin/pending-experiences")
      .then(async (res) => {
        if (res.status === 401) {
          setExperiences([]); router.replace("/login?reason=session-expired");
          return null;
        }
        if (res.status === 403) {
          setForbidden(true);
          setExperiences([]);
          return null;
        }
        if (!res.ok) throw new Error("資歷名單暫時無法載入");
        return res.json();
      })
      .then((data) => {
        if (data) setExperiences(data.experiences ?? []);
      }).catch(() => setError("資歷名單連線中斷，請重新載入"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function respond(id: string, action: "verify" | "reject") {
    if (busyId) return;
    const experience = experiences.find((entry) => entry.id === id);
    if (!experience) return;
    if (action === "reject" && !window.confirm(`確定退回 ${experience.member.name} 的「${experience.positionName}／${experience.organizationName}」資歷嗎？會員可依原因修正後再送審。`)) return;
    setBusyId(id);
    setError(""); setToast("");
    try {
    const res = await fetch(`/api/admin/pending-experiences/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, rejectedReason: reasons[id], expectedUpdatedAt: experience.updatedAt }),
    });
    const result = await res.json().catch(() => ({}));
    if (res.status === 401) { setExperiences([]); router.replace("/login?reason=session-expired"); return; }
    if (res.status === 403) { setExperiences([]); setForbidden(true); return; }
    if (!res.ok) throw new Error(result.error ?? "資歷審核未完成，請重試");
    if (res.ok) {
      setExperiences((prev) => prev.filter((e) => e.id !== id));
      setToast(`${experience.member.name} 的資歷${action === "verify" ? "已核實" : "已退回"}`);
    }
    } catch (failure) { setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : "連線中斷，請重新載入確認結果後再試"); }
    finally { setBusyId(null); }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="px-5 pt-6 pb-4">
          <p className="text-sm text-lion-muted text-center py-12">載入中...</p>
        </div>
      </AppShell>
    );
  }

  if (forbidden) {
    return (
      <AppShell>
        <div className="px-5 pt-6 pb-4">
          <h1 className="text-xl font-bold mb-4">審核會員資歷</h1>
          <p className="text-sm text-lion-muted text-center py-12">
            您目前沒有審核權限。如果您是會長／財務／幹部，請確認帳號是否已被授權。
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-xl font-bold mb-1">審核會員資歷</h1>
        <p className="text-xs text-lion-muted mb-4">待審核 {experiences.length} 筆</p>

        {toast && (
          <div role="status" className="mb-4 rounded-xl border border-lion-border bg-lion-card text-base px-3 py-3">
            {toast}
          </div>
        )}
        {error && <div className="mb-4"><p role="alert" className="text-base text-lion-danger">{error}</p><button type="button" disabled={Boolean(busyId)} onClick={() => void load()} className="mt-2 min-h-12 rounded-xl border border-lion-border px-3 text-sm">重新載入名單</button></div>}

        <div className="flex flex-col gap-3">
          {experiences.length === 0 && !error && (
            <p className="text-sm text-lion-muted text-center py-12">目前沒有待審核的資歷</p>
          )}
          {experiences.map((e) => (
            <div key={e.id} className="rounded-2xl bg-lion-card border border-white/[0.06] p-4">
              <p className="font-semibold text-sm">{e.member.name}</p>
              <p className="text-xs text-lion-muted mt-0.5">{e.member.organization.name}</p>
              <div className="mt-2 text-xs text-lion-cream/70 flex flex-col gap-0.5">
                <p>{e.positionName} · {e.organizationName}</p>
                <p className="text-lion-muted">
                  {formatLionsYear(e)}{e.isCurrent ? "（現任）" : ""}
                </p>
                {e.note && <p className="text-lion-muted">備註：{e.note}</p>}
              </div>
              <input
                aria-label={`退回 ${e.member.name} 的資歷原因`}
                disabled={Boolean(busyId)}
                value={reasons[e.id] ?? ""}
                onChange={(ev) => setReasons((prev) => ({ ...prev, [e.id]: ev.target.value }))}
                placeholder="退回原因（選填）"
                className="w-full mt-3 rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-xs outline-none focus:border-lion-gold"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => respond(e.id, "verify")}
                  disabled={Boolean(busyId)}
                  className="flex-1 rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-2 text-sm disabled:opacity-50"
                >
                  核實
                </button>
                <button
                  onClick={() => respond(e.id, "reject")}
                  disabled={Boolean(busyId)}
                  className="flex-1 rounded-xl bg-white/10 text-lion-cream/70 font-medium py-2 text-sm disabled:opacity-50"
                >
                  退回
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
