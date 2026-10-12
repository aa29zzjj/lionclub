"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";

type PendingExperience = {
  id: string;
  positionName: string;
  organizationName: string;
  startYear: number;
  endYear?: number;
  isCurrent: boolean;
  note?: string;
  member: { id: string; name: string; organization: { name: string } };
};

export default function PendingExperiencesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [experiences, setExperiences] = useState<PendingExperience[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});

  function load() {
    return fetch("/api/admin/pending-experiences")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        if (res.status === 403) {
          setForbidden(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) setExperiences(data.experiences ?? []);
      });
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function respond(id: string, action: "verify" | "reject") {
    setBusyId(id);
    const res = await fetch(`/api/admin/pending-experiences/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, rejectedReason: reasons[id] }),
    });
    if (res.ok) {
      setExperiences((prev) => prev.filter((e) => e.id !== id));
      setToast(action === "verify" ? "已核實" : "已退回");
      setTimeout(() => setToast(""), 2500);
    }
    setBusyId(null);
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
          <div className="mb-4 rounded-xl bg-lion-gold/15 border border-lion-gold/40 text-lion-gold text-xs px-3 py-2">
            {toast}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {experiences.length === 0 && (
            <p className="text-sm text-lion-muted text-center py-12">目前沒有待審核的資歷</p>
          )}
          {experiences.map((e) => (
            <div key={e.id} className="rounded-2xl bg-lion-card border border-white/[0.06] p-4">
              <p className="font-semibold text-sm">{e.member.name}</p>
              <p className="text-xs text-lion-muted mt-0.5">{e.member.organization.name}</p>
              <div className="mt-2 text-xs text-lion-cream/70 flex flex-col gap-0.5">
                <p>{e.positionName} · {e.organizationName}</p>
                <p className="text-lion-muted">
                  {e.startYear} 年{e.isCurrent ? "起（現任）" : e.endYear ? ` – ${e.endYear} 年` : ""}
                </p>
                {e.note && <p className="text-lion-muted">備註：{e.note}</p>}
              </div>
              <input
                value={reasons[e.id] ?? ""}
                onChange={(ev) => setReasons((prev) => ({ ...prev, [e.id]: ev.target.value }))}
                placeholder="退回原因（選填）"
                className="w-full mt-3 rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-xs outline-none focus:border-lion-gold"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => respond(e.id, "verify")}
                  disabled={busyId === e.id}
                  className="flex-1 rounded-xl bg-lion-gold text-lion-navyDeep font-semibold py-2 text-sm disabled:opacity-50"
                >
                  核實
                </button>
                <button
                  onClick={() => respond(e.id, "reject")}
                  disabled={busyId === e.id}
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
