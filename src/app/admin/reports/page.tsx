"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";

type Report = {
  id: string;
  reason: string;
  details: string | null;
  createdAt: string;
  reporter: { id: string; name: string; email: string | null };
  target: { id: string; name: string; email: string | null; status: string };
};

export default function AdminReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  function load() {
    setLoading(true); setError("");
    return fetch("/api/admin/reports")
      .then(async (res) => {
        if (res.status === 401) {
          setReports([]); router.replace("/login?reason=session-expired");
          return null;
        }
        if (res.status === 403) {
          setForbidden(true);
          setReports([]);
          return null;
        }
        if (!res.ok) throw new Error("檢舉名單暫時無法載入");
        return res.json();
      })
      .then((data) => {
        if (data) setReports(data.reports ?? []);
      }).catch(() => setError("檢舉名單連線中斷，請重新載入"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function respond(id: string, action: "review" | "dismiss") {
    if (busyId) return;
    setBusyId(id);
    setError("");
    try {
    const res = await fetch(`/api/admin/reports/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const result = await res.json().catch(() => ({}));
    if (res.status === 401) { setReports([]); router.replace("/login?reason=session-expired"); return; }
    if (res.status === 403) { setReports([]); setForbidden(true); return; }
    if (!res.ok) throw new Error(result.error ?? "檢舉狀態未更新，請重試");
    if (res.ok) {
      setReports((prev) => prev.filter((r) => r.id !== id));
      setToast(action === "review" ? "已標記已處理" : "已結案");
    }
    } catch (failure) { setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : "連線中斷，請重新載入確認處理結果"); }
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
          <h1 className="text-xl font-bold mb-4">檢舉管理</h1>
          <p className="text-sm text-lion-muted text-center py-12">僅限全域管理者查看。</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-xl font-bold mb-1">檢舉管理</h1>
        <p className="text-xs text-lion-muted mb-4">待處理 {reports.length} 筆</p>
        <p className="mb-4 text-sm leading-relaxed text-lion-muted">標記已處理／駁回僅記錄本次審核結論，不會自動停權會員；必要處置請依營運流程另行處理。</p>

        {toast && (
          <div role="status" className="mb-4 rounded-xl border border-lion-border bg-lion-card text-base px-3 py-3">
            {toast}
          </div>
        )}
        {error && <div className="mb-4"><p role="alert" className="text-base text-lion-danger">{error}</p><button type="button" disabled={Boolean(busyId)} onClick={() => void load()} className="mt-2 min-h-12 rounded-xl border border-lion-border px-3 text-sm">重新載入檢舉</button></div>}

        <div className="flex flex-col gap-3">
          {reports.length === 0 && !error && <p className="text-sm text-lion-muted text-center py-12">目前沒有待處理的檢舉</p>}
          {reports.map((r) => (
            <div key={r.id} className="rounded-2xl bg-lion-card border border-white/[0.06] p-4">
              <p className="text-xs text-lion-muted">
                {r.reporter.name}（{r.reporter.email ?? "—"}）檢舉 {r.target.name}（{r.target.email ?? "—"}）
              </p>
              <p className="mt-2 text-sm font-medium">{r.reason}</p>
              {r.details && <p className="mt-1 text-xs text-lion-cream/70">{r.details}</p>}
              <p className="mt-2 text-[11px] text-lion-muted">
                {new Date(r.createdAt).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => respond(r.id, "review")}
                  disabled={Boolean(busyId)}
                  className="flex-1 rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-2 text-sm disabled:opacity-50"
                >
                  標記已處理
                </button>
                <button
                  onClick={() => respond(r.id, "dismiss")}
                  disabled={Boolean(busyId)}
                  className="flex-1 rounded-xl bg-white/10 text-lion-cream/70 font-medium py-2 text-sm disabled:opacity-50"
                >
                  駁回
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
