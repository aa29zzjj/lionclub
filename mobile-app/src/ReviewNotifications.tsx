import { useCallback, useEffect, useRef, useState } from "react";
import { createApiClient, type PushReceipt } from "./contract";
import { EVENT_TIME_ZONE } from "../../src/lib/event-calendar";
declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

/** Only generic, actor-scoped review receipts; details stay behind existing APIs. */
export default function ReviewNotifications({ onOpenProfile }: { onOpenProfile?: () => void }) {
  const [items, setItems] = useState<PushReceipt[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const markLock = useRef(false);
  const mounted = useRef(false);
  const load = useCallback(async (afterMark = false) => {
    if (!mounted.current || markLock.current && !afterMark) return;
    const attempt = ++generation.current;
    setLoading(true); setError(null);
    try {
      const data = await api.getPushReceipts();
      if (!mounted.current || generation.current !== attempt) return;
      setEnabled(data.enabled); setItems(data.receipts);
    } catch {
      if (mounted.current && generation.current === attempt) setError("審核通知尚未讀取完成，並不表示沒有通知。請重新讀取。");
    } finally {
      if (mounted.current && generation.current === attempt) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load(); const refresh = () => void load();
    window.addEventListener("lion-notifications-refresh", refresh);
    return () => { mounted.current = false; generation.current++; window.removeEventListener("lion-notifications-refresh", refresh); };
  }, [load]);
  async function markRead() {
    if (markLock.current || loading || !mounted.current) return;
    const ids = [...new Set(items.filter(item => !item.readAt).map(item => item.id))].slice(0, 100);
    if (!ids.length) return;
    markLock.current = true; generation.current++; setBusy(true); setError(null);
    try {
      await api.markPushReceiptsRead(ids);
      if (mounted.current) await load(true);
    } catch {
      if (mounted.current) setError("審核通知的已讀狀態尚未確認，請重新讀取後再操作。");
    } finally { markLock.current = false; if (mounted.current) setBusy(false); }
  }
  if (!enabled && !error && !loading) return null;
  return <section aria-labelledby="review-notifications-heading" aria-busy={loading || busy}>
    <h2 className="section-title" id="review-notifications-heading">審核結果</h2>
    {loading ? <p className="member-meta" role="status">讀取審核通知中…</p> : null}
    {error ? <><p role="alert" className="error">{error}</p><button type="button" className="secondary" disabled={loading || busy} onClick={() => void load()}>重新讀取</button></> : null}
    {!loading && !error && !items.length ? <p className="member-meta">近期沒有審核更新；詳細結果請至「我的」查看會員資料與資歷。</p> : null}
    {onOpenProfile ? <button type="button" className="secondary" onClick={onOpenProfile}>至我的檔案查看審核結果</button> : null}
    <div className="list-stack">{items.map(item => <article key={item.id} className={item.readAt ? "list-card" : "list-card list-card-unread"}>
      <div className="list-card-main"><h3 className="list-card-title">{item.title}</h3><p className="list-card-message">{item.body}</p><p className="list-card-meta">{new Date(item.createdAt).toLocaleString("zh-TW", { timeZone: EVENT_TIME_ZONE })}</p></div>
    </article>)}</div>
    {items.some(item => !item.readAt) ? <button type="button" className="secondary" disabled={busy || loading} onClick={() => void markRead()}>{busy ? "更新中…" : "標示審核通知為已讀"}</button> : null}
  </section>;
}
