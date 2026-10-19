"use client";

import { useState } from "react";

export default function EventReportPanel({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit() {
    if (busy || reason.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${eventId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim(), details: details.trim() || undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error ?? "檢舉未送出，請重試"); return; }
      setSent(true);
      setOpen(false);
    } catch {
      setError("連線中斷，檢舉送出結果尚未確認，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <p role="status" className="mt-4 text-center text-sm text-lion-muted">已送出檢舉，感謝您的回報。</p>;

  return (
    <div className="mt-4">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mx-auto flex min-h-12 items-center text-sm text-lion-muted underline">檢舉此活動內容</button>
      ) : (
        <div className="rounded-xl border border-lion-border bg-lion-card p-4">
          <label htmlFor="event-report-reason" className="mb-1 block text-sm text-lion-muted">檢舉原因（必填）</label>
          <input id="event-report-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} disabled={busy} placeholder="例如：不當內容、詐騙、騷擾" className="min-h-12 w-full rounded-xl border border-lion-border bg-lion-page px-3 text-base" />
          <label htmlFor="event-report-details" className="mb-1 mt-3 block text-sm text-lion-muted">補充說明（選填）</label>
          <textarea id="event-report-details" value={details} onChange={(event) => setDetails(event.target.value)} maxLength={2000} rows={3} disabled={busy} className="w-full resize-none rounded-xl border border-lion-border bg-lion-page px-3 py-2.5 text-base" />
          {error && <p role="alert" className="mt-2 text-sm text-lion-danger">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => { setOpen(false); setError(""); }} disabled={busy} className="min-h-12 flex-1 rounded-xl bg-white/10 text-sm disabled:opacity-50">取消</button>
            <button type="button" onClick={submit} disabled={busy || reason.trim().length < 2} className="min-h-12 flex-1 rounded-xl bg-lion-action text-sm font-semibold text-lion-navyDeep disabled:opacity-50">{busy ? "送出中…" : "送出檢舉"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
