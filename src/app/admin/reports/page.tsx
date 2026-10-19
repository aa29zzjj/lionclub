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

type EventReportItem = {
  id: string;
  reason: string;
  details: string | null;
  createdAt: string;
  eventTitle: string;
  reporter: { id: string; name: string; email: string | null };
  event: { id: string; title: string; description: string | null; createdBy: { id: string; name: string } } | null;
};

type Kind = "member" | "event";
type Action = "review" | "dismiss" | "suspend" | "remove_content";

export default function AdminReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [eventReports, setEventReports] = useState<EventReportItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  function load() {
    setLoading(true); setError("");
    return fetch("/api/admin/reports")
      .then(async (res) => {
        if (res.status === 401) {
          setReports([]); setEventReports([]); router.replace("/login?reason=session-expired");
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
        if (data) { setReports(data.reports ?? []); setEventReports(data.eventReports ?? []); }
      }).catch(() => setError("檢舉名單連線中斷，請重新載入"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function respond(id: string, kind: Kind, action: Action) {
    if (busyId) return;
    if (action === "suspend" && !window.confirm("確定停權此會員？停權後對方所有登入立即失效，無法再登入。")) return;
    if (action === "remove_content" && !window.confirm("確定移除此活動的內容？標題將改為「內容已因違規移除」，說明、封面與地點會被清除，報名資料保留。")) return;
    setBusyId(id);
    setError("");
    try {
    const res = await fetch(`/api/admin/reports/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, action }),
    });
    const result = await res.json().catch(() => ({}));
    if (res.status === 401) { setReports([]); setEventReports([]); router.replace("/login?reason=session-expired"); return; }
    if (res.status === 403) { setReports([]); setEventReports([]); setForbidden(true); return; }
    if (!res.ok) throw new Error(result.error ?? "檢舉狀態未更新，請重試");
    if (res.ok) {
      if (kind === "member") setReports((prev) => prev.filter((r) => r.id !== id));
      else setEventReports((prev) => prev.filter((r) => r.id !== id));
      setToast(action === "suspend" ? "已停權該會員並結案" : action === "remove_content" ? "已移除違規內容並結案" : action === "review" ? "已標記已處理" : "已結案");
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
        <p className="text-xs text-lion-muted mb-4">待處理 {reports.length + eventReports.length} 筆</p>
        <p className="mb-4 text-sm leading-relaxed text-lion-muted">查證屬實時請使用「停權會員」或「移除活動內容」；「標記已處理」只記錄審核結論，「駁回」代表檢舉不成立。</p>

        {toast && (
          <div role="status" className="mb-4 rounded-xl border border-lion-border bg-lion-card text-base px-3 py-3">
            {toast}
          </div>
        )}
        {error && <div className="mb-4"><p role="alert" className="text-base text-lion-danger">{error}</p><button type="button" disabled={Boolean(busyId)} onClick={() => void load()} className="mt-2 min-h-12 rounded-xl border border-lion-border px-3 text-sm">重新載入檢舉</button></div>}

        <div className="flex flex-col gap-3">
          {reports.length + eventReports.length === 0 && !error && <p className="text-sm text-lion-muted text-center py-12">目前沒有待處理的檢舉</p>}
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
                  onClick={() => respond(r.id, "member", "suspend")}
                  disabled={Boolean(busyId) || r.target.status !== "ACTIVE"}
                  className="flex-1 rounded-xl bg-red-500/80 text-white font-semibold py-2 text-sm disabled:opacity-50"
                >
                  停權會員
                </button>
                <button
                  onClick={() => respond(r.id, "member", "review")}
                  disabled={Boolean(busyId)}
                  className="flex-1 rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-2 text-sm disabled:opacity-50"
                >
                  標記已處理
                </button>
                <button
                  onClick={() => respond(r.id, "member", "dismiss")}
                  disabled={Boolean(busyId)}
                  className="flex-1 rounded-xl bg-white/10 text-lion-cream/70 font-medium py-2 text-sm disabled:opacity-50"
                >
                  駁回
                </button>
              </div>
            </div>
          ))}
          {eventReports.map((r) => (
            <div key={r.id} className="rounded-2xl bg-lion-card border border-white/[0.06] p-4">
              <p className="text-[11px] font-medium tracking-[0.14em] text-lion-gold">活動檢舉</p>
              <p className="mt-1 text-xs text-lion-muted">
                {r.reporter.name}（{r.reporter.email ?? "—"}）檢舉活動「{r.event?.title ?? r.eventTitle}」{r.event ? `，發布人 ${r.event.createdBy.name}` : "（活動已不存在）"}
              </p>
              <p className="mt-2 text-sm font-medium">{r.reason}</p>
              {r.details && <p className="mt-1 text-xs text-lion-cream/70">{r.details}</p>}
              {r.event?.description && <p className="mt-2 rounded-lg bg-white/[0.04] p-2 text-xs text-lion-cream/60 line-clamp-4">活動說明：{r.event.description}</p>}
              <p className="mt-2 text-[11px] text-lion-muted">
                {new Date(r.createdAt).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => respond(r.id, "event", "remove_content")} disabled={Boolean(busyId) || !r.event} className="flex-1 rounded-xl bg-red-500/80 text-white font-semibold py-2 text-sm disabled:opacity-50">移除內容</button>
                <button onClick={() => respond(r.id, "event", "review")} disabled={Boolean(busyId)} className="flex-1 rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-2 text-sm disabled:opacity-50">標記已處理</button>
                <button onClick={() => respond(r.id, "event", "dismiss")} disabled={Boolean(busyId)} className="flex-1 rounded-xl bg-white/10 text-lion-cream/70 font-medium py-2 text-sm disabled:opacity-50">駁回</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
