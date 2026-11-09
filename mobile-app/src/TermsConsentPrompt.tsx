import { useCallback, useEffect, useRef, useState } from "react";
import { Browser } from "@capacitor/browser";
import { createApiClient, type TermsConsentStatus } from "./contract";

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);
const TERMS_URL = "https://lionclubsmembership.com/terms";
type Props = { memberId: string; onAccepted: () => void; onCancel?: () => void };

/** Key the state to the visible member; opening the public terms never consents. */
export default function TermsConsentPrompt(props: Props) {
  return <TermsConsentContent key={props.memberId} {...props} />;
}

function TermsConsentContent({ onAccepted, onCancel }: Props) {
  const [status, setStatus] = useState<TermsConsentStatus | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const locked = useRef(false);
  const openLock = useRef(false);
  const sessionCurrent = useRef(api.captureSessionGuard()).current;
  const current = useCallback(() => mounted.current && sessionCurrent(), [sessionCurrent]);

  const load = useCallback(async () => {
    if (!current() || locked.current) return;
    locked.current = true; setBusy(true); setError(""); setStatus(null); setChecked(false);
    try {
      const result = await api.getTermsConsent();
      if (current()) setStatus(result);
    } catch {
      if (current()) setError("使用條款狀態尚未讀取完成，並不表示已同意。請重新讀取。");
    } finally { locked.current = false; if (current()) setBusy(false); }
  }, [current]);

  useEffect(() => {
    mounted.current = true; void load();
    return () => { mounted.current = false; };
  }, [load]);

  async function accept() {
    if (!current() || locked.current || !checked || !status || status.accepted) return;
    locked.current = true; setBusy(true); setError("");
    try {
      await api.acceptTerms(status.termsVersion);
      if (current()) onAccepted();
    } catch {
      if (current()) {
        setStatus(null); setChecked(false);
        setError("同意結果尚未確認。請重新讀取，確認後再繼續。");
      }
    } finally { locked.current = false; if (current()) setBusy(false); }
  }

  async function openTerms() {
    if (!current() || openLock.current) return;
    openLock.current = true; setOpening(true);
    try { await Browser.open({ url: TERMS_URL, presentationStyle: "popover" }); }
    catch { if (current()) setError("暫時無法開啟使用條款，請稍後再試。"); }
    finally { openLock.current = false; if (current()) setOpening(false); }
  }

  return <section aria-label="確認使用條款" aria-busy={busy} className="list-stack">
    <h2 className="section-title">發布前，請先確認使用條款</h2>
    <p className="member-meta">請閱讀不得發布違規內容、檢舉及停權規則。您的活動草稿會保留；完成後請自行再次按下發布。</p>
    <button type="button" className="secondary" disabled={opening || busy} onClick={() => void openTerms()}>{opening ? "開啟中…" : "閱讀使用條款"}</button>
    {busy ? <p className="member-meta" role="status">正在確認使用條款狀態…</p> : null}
    {status ? <p className="member-meta">條款版本：{status.termsVersion}</p> : null}
    {status?.accepted ? <>
      <p role="status">已確認您同意目前版本的使用條款。</p>
      <button type="button" disabled={busy} onClick={() => { if (current()) onAccepted(); }}>返回編輯</button>
    </> : status ? <>
      <label style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
        <input type="checkbox" checked={checked} disabled={busy} onChange={event => setChecked(event.target.checked)} />
        <span>我已閱讀並同意使用條款，包含不得發布違規內容及檢舉與停權規則</span>
      </label>
      <button type="button" disabled={busy || !checked} onClick={() => void accept()}>{busy ? "確認中…" : "同意並返回編輯"}</button>
    </> : !busy ? <button type="button" className="secondary" onClick={() => void load()}>重新讀取條款狀態</button> : null}
    {error ? <p role="alert" className="error">{error}</p> : null}
    {onCancel ? <button type="button" className="secondary" disabled={busy} onClick={() => { if (current()) onCancel(); }}>稍後再確認</button> : null}
  </section>;
}
