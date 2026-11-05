import { useCallback, useEffect, useState } from "react";
import { createApiClient, type PushReceipt } from "./contract";
declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

/** Only generic, actor-scoped review receipts; details stay behind existing APIs. */
export default function ReviewNotifications() {
  const [items, setItems] = useState<PushReceipt[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    try { const data = await api.getPushReceipts(); setEnabled(data.enabled); setItems(data.receipts); }
    catch { setError(true); }
  }, []);
  useEffect(() => {
    void load(); const refresh = () => void load();
    window.addEventListener("lion-notifications-refresh", refresh);
    return () => window.removeEventListener("lion-notifications-refresh", refresh);
  }, [load]);
  async function markRead() {
    if (busy) return; setBusy(true); setError(false);
    try { await api.markPushReceiptsRead(items.filter(item => !item.readAt).map(item => item.id)); await load(); }
    catch { setError(true); } finally { setBusy(false); }
  }
  if (!enabled && !error) return null;
  return <section aria-labelledby="review-notifications-heading">
    <h2 className="section-title" id="review-notifications-heading">審核結果</h2>
    {error ? <><p role="alert" className="error">審核通知尚未讀取完成，並不表示沒有通知。</p><button type="button" className="secondary" onClick={() => void load()}>重新讀取</button></> : null}
    {!error && !items.length ? <p className="member-meta">近期沒有審核更新；詳細結果請至「我的」查看會員資料與資歷。</p> : null}
    <div className="list-stack">{items.map(item => <article key={item.id} className={item.readAt ? "list-card" : "list-card list-card-unread"}>
      <div className="list-card-main"><h3 className="list-card-title">{item.title}</h3><p className="list-card-message">{item.body}</p><p className="list-card-meta">{new Date(item.createdAt).toLocaleString("zh-TW")}</p></div>
    </article>)}</div>
    {items.some(item => !item.readAt) ? <button type="button" className="secondary" disabled={busy} onClick={() => void markRead()}>{busy ? "更新中…" : "標示審核通知為已讀"}</button> : null}
  </section>;
}
