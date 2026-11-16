"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PhaseNoticeItem } from "../lib/phase-notices";
import type { NextPhaseTransport } from "../lib/next-phase-client";

export default function PhaseInbox({ send, open }: { send: NextPhaseTransport; open: (item: PhaseNoticeItem) => void }) {
  const [items, setItems] = useState<PhaseNoticeItem[]>([]);
  const [error, setError] = useState(false);
  const [opening, setOpening] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const attempt = ++generation.current;
    try {
      const { items } = await send<{ items: PhaseNoticeItem[] }>({ view: "notices" });
      if (attempt === generation.current) { setItems(items); setError(false); }
    } catch {
      if (attempt === generation.current) { setItems([]); setError(true); }
    }
  }, [send]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => { generation.current++; clearInterval(timer); };
  }, [load]);

  async function openItem(item: PhaseNoticeItem) {
    if (opening) return;
    setOpening(true);
    try {
      if (!item.readAt) await send({ action: "notice.read", id: item.id });
      open(item);
    } catch { setError(true); }
    finally { setOpening(false); }
  }

  if (!items.length && !error) return null;
  const unread = items.filter(item => !item.readAt).length;
  return <section className="service-hub" aria-label="揪團與合作通知">
    <h2>揪團與合作{unread ? `（${unread} 未讀）` : ""}</h2>
    {error && <p role="alert">通知暫時無法更新。 <button type="button" onClick={() => void load()}>重新讀取</button></p>}
    {items.map(item => <article key={item.id} className={`sh-card ${item.readAt ? "" : "sh-notice"}`}>
      <div className="sh-row"><strong>{item.title}</strong>{!item.readAt && <span className="sh-badge">未讀</span>}</div>
      <h3>{item.subject}</h3><p className="sh-prewrap">{item.message}</p>
      <button type="button" disabled={opening} onClick={() => void openItem(item)}>{item.target === "meetup" ? "查看揪團" : "查看合作需求"}</button>
    </article>)}
  </section>;
}
