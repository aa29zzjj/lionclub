"use client";

import { useCallback, useEffect, useState } from "react";
import { ROSTER_CONSENT_VERSION } from "@/lib/roster-consent-policy";

export default function RosterConsentPanel({ onChange }: { onChange: (accepted: boolean) => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [available, setAvailable] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/me/roster-consent", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.version !== ROSTER_CONSENT_VERSION || data.available !== true) throw Error(data.error ?? "名冊比對尚未完成部署，請稍後再試。");
      const agreed = data.accepted === true;
      setAvailable(true); setAccepted(agreed); onChange(agreed);
    } catch (failure) {
      setAvailable(false); setAccepted(false); onChange(false);
      setError(failure instanceof TypeError ? "連線中斷，未能確認同意狀態；不會開始比對。" : failure instanceof Error ? failure.message : "同意狀態暫時無法讀取。");
    } finally { setLoading(false); }
  }, [onChange]);
  useEffect(() => { void load(); }, [load]);
  async function update(agree: boolean) {
    if (saving || agree && !checked) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/me/roster-consent", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agree ? { accepted: true, version: ROSTER_CONSENT_VERSION } : { accepted: false }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.version !== ROSTER_CONSENT_VERSION || data.available !== true || data.accepted !== agree) throw Error(data.error ?? "同意更新未確認，請重新載入狀態。");
      setAccepted(agree); setChecked(false); onChange(agree);
      setNotice(agree ? "已同意本用途，開始檢查可供本人核對的候選。" : "已撤回；停止比對與帶入。既有本人草稿不會自動刪除，可自行編輯或刪除。");
    } catch (failure) {
      setAvailable(false); setAccepted(false); setChecked(false);
      onChange(false);
      setError(failure instanceof TypeError ? "連線中斷，結果未確認；請重新載入，不自動重送。" : failure instanceof Error ? failure.message : "操作未完成。");
    } finally { setSaving(false); }
  }
  return <section aria-labelledby="roster-consent-heading" className="mb-5 rounded-2xl border border-lion-border bg-lion-card p-4">
    <h2 id="roster-consent-heading" className="text-base font-semibold">選用：本人名冊比對</h2>
    <p className="mt-2 text-sm leading-relaxed text-lion-muted">只以您的姓名與分會比對年度核定名冊，提供任職候選與自填待核實草稿；沒有電話來源，不是身分驗證，也不自動建立帳號連結或管理權限。待分派分會僅提供候選，不直接認領。</p>
    <p className="mt-2 text-sm leading-relaxed text-lion-muted">不同意或撤回不影響登入及手填資歷。撤回會停止新比對與帶入，已由本人確認的草稿可另行刪除。本用途不代表名冊被列者已同意向其他會員揭露姓名。</p>
    <p className="mt-2 text-xs text-lion-muted">用途版本：{ROSTER_CONSENT_VERSION}</p>
    {loading ? <p role="status" className="mt-3 text-sm text-lion-muted">正在讀取同意狀態…</p> : available && (accepted ? <div className="mt-3 flex flex-wrap items-center gap-3">
      <p className="text-sm">已自行同意，可隨時撤回。</p><button type="button" disabled={saving} onClick={() => void update(false)} className="min-h-12 rounded-xl border border-lion-border px-4 text-sm disabled:opacity-50">{saving ? "處理中…" : "撤回名冊比對同意"}</button>
    </div> : <div className="mt-3">
      <label className="flex min-h-12 items-start gap-3 text-sm leading-relaxed"><input type="checkbox" checked={checked} disabled={saving} onChange={event => setChecked(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#C8A951]" />我已閱讀，願意讓平台以本人姓名及分會進行此選用比對，了解候選仍須核對。</label>
      <button type="button" disabled={saving || !checked} onClick={() => void update(true)} className="mt-2 min-h-12 rounded-xl bg-lion-action px-4 text-sm font-semibold text-lion-navyDeep disabled:opacity-50">{saving ? "處理中…" : "同意並查看候選"}</button>
    </div>)}
    {error && <div className="mt-3"><p role="alert" className="text-sm text-lion-danger">{error}</p><button type="button" disabled={loading || saving} onClick={() => void load()} className="mt-2 min-h-12 rounded-xl border border-lion-border px-4 text-sm">重新讀取同意狀態</button></div>}
    {notice && <p role="status" className="mt-3 text-sm text-lion-muted">{notice}</p>}
  </section>;
}
