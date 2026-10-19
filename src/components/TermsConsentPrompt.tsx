"use client";

import { useState } from "react";
import Link from "next/link";

export default function TermsConsentPrompt({ onAccepted }: { onAccepted: () => void }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    if (!checked || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/me/terms-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error ?? "同意未送出，請重試"); return; }
      onAccepted();
    } catch {
      setError("連線中斷，同意結果尚未確認，請重試");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="alert" className="rounded-xl border border-lion-gold/40 bg-lion-gold/5 p-4">
      <p className="text-base font-medium">發布內容前，請先同意使用條款</p>
      <label className="mt-3 flex items-start gap-2.5 text-sm">
        <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} disabled={busy} className="mt-0.5 accent-[#C8A951]" />
        <span>
          我已閱讀並同意
          <Link href="/terms" target="_blank" className="text-lion-gold underline mx-1">使用條款</Link>
          ，包含不得發布違規內容及檢舉與停權規則
        </span>
      </label>
      {error && <p className="mt-2 text-sm text-lion-danger">{error}</p>}
      <button type="button" onClick={accept} disabled={!checked || busy} className="mt-3 min-h-12 w-full rounded-xl bg-lion-action px-4 text-base font-semibold text-lion-navyDeep disabled:opacity-50">
        {busy ? "送出中…" : "同意並繼續"}
      </button>
    </div>
  );
}
