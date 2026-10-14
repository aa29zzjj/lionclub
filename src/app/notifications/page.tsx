"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import { colorFromId } from "@/lib/avatar-color";

type Friend = { id: string; name: string; nickname?: string; photoUrl?: string };
type EventOption = { id: string; title: string; startAt: string };
type SentNotification = { id: string; eventTitle: string; recipients: string[]; message: string; sentAt: string };
type InboxNotification = { id: string; notificationId: string; eventId: string; eventTitle: string; message: string; sentAt: string; readAt: string | null; sender: { id: string; name: string; nickname: string | null } };

export default function NotificationsPage() {
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [notifications, setNotifications] = useState<SentNotification[]>([]);
  const [inbox, setInbox] = useState<InboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [tab, setTab] = useState<"received" | "sent">("received");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [marking, setMarking] = useState(false);
  const [composing, setComposing] = useState(false);
  const [eventId, setEventId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [recipientType, setRecipientType] = useState<"selected" | "organization">("selected");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const responses = await Promise.all([fetch("/api/friends", { cache: "no-store" }), fetch("/api/events", { cache: "no-store" }), fetch("/api/notifications", { cache: "no-store" })]);
      if (responses.some((response) => response.status === 401)) { router.replace("/login?reason=session-expired"); return; }
      const results = await Promise.all(responses.map((response) => response.json().catch(() => ({}))));
      const notificationsData = results[2];
      if (!responses[2].ok) throw new Error(notificationsData.error ?? "活動通知無法載入");
      setNotifications(notificationsData.notifications ?? []); setInbox(notificationsData.inbox ?? []); setUnreadCount(notificationsData.unreadCount ?? 0);
      if (responses[0].ok) setFriends(results[0].friends ?? []);
      if (responses[1].ok) { setEvents(results[1].events ?? []); setEventId((current) => current || results[1].events?.[0]?.id || ""); }
      if (!responses[0].ok || !responses[1].ok) setError("通知已載入，但活動或收件人資料暫時不完整，請重新載入後再發送。");
    } catch (failure) { setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : "通知連線中斷，請重新載入"); }
    finally { setLoading(false); }
  }, [router]);
  useEffect(() => { void load(); }, [load]);

  async function markRead(ids: string[]) {
    if (marking || !ids.length) return;
    setMarking(true); setError("");
    try {
      const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...new Set(ids)] }) });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { router.replace("/login?reason=session-expired"); return; }
      if (!response.ok) throw new Error(result.error ?? "已讀狀態未更新，請重試");
      const changed = inbox.filter((entry) => !entry.readAt && ids.includes(entry.notificationId)).length;
      setInbox((current) => current.map((entry) => ids.includes(entry.notificationId) ? { ...entry, readAt: entry.readAt || new Date().toISOString() } : entry));
      setUnreadCount((count) => Math.max(0, count - changed));
    } catch (failure) { setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : "連線中斷，未能標為已讀"); }
    finally { setMarking(false); }
  }

  function resetForm() { setSelected([]); setRecipientType("selected"); setMessage(""); setComposing(false); }
  async function handleSend(event: React.FormEvent) {
    event.preventDefault(); if (sending || !eventId || (recipientType === "selected" && !selected.length)) return;
    setSending(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, recipientType, memberIds: selected, message: message || undefined }) });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { router.replace("/login?reason=session-expired"); return; }
      if (!response.ok) throw new Error(result.error ?? "發送失敗，請重試");
      setNotice(`已發送給 ${result.recipientCount} 位會員`); resetForm(); setTab("sent"); await load();
    } catch (failure) { setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : "連線中斷，發送結果尚未確認。請先重新載入已發送紀錄，再決定是否重送。"); }
    finally { setSending(false); }
  }

  return <AppShell><div className="px-5 pb-8 pt-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-bold">活動通知</h1><button type="button" disabled={sending} onClick={() => { setComposing(true); setError(""); }} className="min-h-12 rounded-xl bg-lion-action px-3 text-sm font-semibold text-lion-navyDeep">＋ 發送通知</button></div>
    {notice && <p role="status" className="mb-4 rounded-xl border border-lion-border bg-lion-card p-3 text-base">{notice}</p>}
    {error && <div className="mb-4"><p role="alert" className="text-base text-lion-danger">{error}</p><button type="button" disabled={loading || sending} onClick={() => void load()} className="mt-2 min-h-12 rounded-xl border border-lion-border px-3 text-sm">重新載入通知</button></div>}
    {!composing && <>
      <div role="tablist" aria-label="通知分類" className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-lion-soft p-1"><button type="button" role="tab" id="notification-received-tab" aria-controls="notification-panel" aria-selected={tab === "received"} onClick={() => setTab("received")} className={`min-h-12 rounded-lg px-2 text-base ${tab === "received" ? "bg-lion-action font-semibold text-lion-navyDeep" : "text-lion-muted"}`}>收到的通知{unreadCount ? `（${unreadCount} 未讀）` : ""}</button><button type="button" role="tab" id="notification-sent-tab" aria-controls="notification-panel" aria-selected={tab === "sent"} onClick={() => setTab("sent")} className={`min-h-12 rounded-lg px-2 text-base ${tab === "sent" ? "bg-lion-action font-semibold text-lion-navyDeep" : "text-lion-muted"}`}>已發送</button></div>
      {loading ? <p role="status" className="py-10 text-center">載入通知中…</p> : <section id="notification-panel" role="tabpanel" aria-labelledby={tab === "received" ? "notification-received-tab" : "notification-sent-tab"} className="space-y-3">
        {tab === "received" ? <>
          {unreadCount > 0 && <button type="button" disabled={marking} onClick={() => void markRead(inbox.filter((entry) => !entry.readAt).map((entry) => entry.notificationId))} className="min-h-12 rounded-xl border border-lion-border px-3 text-sm disabled:opacity-50">{marking ? "更新中…" : "將這些通知全部標為已讀"}</button>}
          {inbox.length === 0 && <p className="py-10 text-center text-base text-lion-muted">目前沒有收到活動通知</p>}
          {inbox.map((entry) => <article key={entry.id} className={`rounded-2xl border bg-lion-card p-4 ${entry.readAt ? "border-lion-border" : "border-lion-gold"}`}>
            <div className="flex flex-wrap justify-between gap-2"><h2 className="text-base font-semibold">{entry.eventTitle}</h2><span className="text-sm text-lion-muted">{entry.readAt ? "已讀" : "● 未讀"}</span></div><p className="mt-1 text-sm text-lion-muted">{entry.sender.nickname || entry.sender.name} · {new Date(entry.sentAt).toLocaleString("zh-TW")}</p><p className="mt-3 whitespace-pre-wrap break-words text-base leading-relaxed">{entry.message || "邀請您查看這場活動"}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { if (!entry.readAt) void markRead([entry.notificationId]); router.push(`/events/${encodeURIComponent(entry.eventId)}`); }} className="min-h-12 rounded-xl bg-lion-action px-3 text-sm font-semibold text-lion-navyDeep">查看活動</button>{!entry.readAt && <button type="button" disabled={marking} onClick={() => void markRead([entry.notificationId])} className="min-h-12 rounded-xl border border-lion-border px-3 text-sm disabled:opacity-50">標為已讀</button>}</div>
          </article>)}
        </> : notifications.length === 0 ? <p className="py-10 text-center text-base text-lion-muted">尚未發送活動通知</p> : notifications.map((entry) => <article key={entry.id} className="rounded-2xl border border-lion-border bg-lion-card p-4"><h2 className="text-base font-semibold">{entry.eventTitle}</h2><p className="mt-1 text-sm text-lion-muted">{new Date(entry.sentAt).toLocaleString("zh-TW")}</p><p className="mt-3 whitespace-pre-wrap break-words text-base leading-relaxed">{entry.message}</p><p className="mt-3 break-words text-sm text-lion-muted">已通知：{entry.recipients.join("、")}</p></article>)}
      </section>}
    </>}
    {composing && <form onSubmit={handleSend} className="space-y-4" aria-busy={sending}><fieldset disabled={sending} className="space-y-4">
      <div><label htmlFor="notification-event" className="mb-1 block text-sm font-medium">選擇活動</label><select id="notification-event" required value={eventId} onChange={(event) => setEventId(event.target.value)} className="min-h-12 w-full rounded-xl border border-lion-border bg-lion-card px-3 text-base">{events.length === 0 && <option value="">尚無可選活動</option>}{events.map((event) => <option key={event.id} value={event.id} className="bg-lion-card text-lion-cream">{event.title}（{new Date(event.startAt).toLocaleDateString("zh-TW")}）</option>)}</select></div>
      <fieldset><legend className="mb-2 text-sm font-medium">收件範圍</legend><div className="mb-3 grid grid-cols-2 gap-2">{(["selected", "organization"] as const).map((type) => <button key={type} type="button" aria-pressed={recipientType === type} onClick={() => setRecipientType(type)} className={`min-h-12 rounded-xl border px-3 text-sm ${recipientType === type ? "border-lion-gold bg-lion-soft font-semibold text-lion-gold" : "border-lion-border"}`}>{type === "selected" ? "指定好友" : "整個分會"}</button>)}</div>{recipientType === "organization" ? <p className="rounded-xl border border-lion-border bg-lion-soft p-3 text-sm leading-relaxed">通知同分會所有啟用會員；限活動建立者或授權幹部，不能跨越管理範圍。</p> : <div><p className="mb-2 text-sm text-lion-muted">已選 {selected.length} 位好友</p>{friends.length === 0 && <p className="text-sm text-lion-muted">先加入好友後，即可選擇收件人。</p>}<div className="max-h-72 space-y-2 overflow-y-auto">{friends.map((friend) => <button type="button" key={friend.id} aria-pressed={selected.includes(friend.id)} onClick={() => setSelected((current) => current.includes(friend.id) ? current.filter((id) => id !== friend.id) : [...current, friend.id])} className={`flex min-h-12 w-full items-center gap-3 rounded-xl border p-3 text-left ${selected.includes(friend.id) ? "border-lion-gold bg-lion-soft" : "border-lion-border"}`}><Avatar name={friend.name} color={colorFromId(friend.id)} imageUrl={friend.photoUrl} size={36} /><span className="min-w-0 flex-1 break-words text-base">{friend.nickname || friend.name}</span><span aria-hidden="true">{selected.includes(friend.id) ? "✓" : "○"}</span></button>)}</div></div>}</fieldset>
      <div><label htmlFor="notification-message" className="mb-1 block text-sm font-medium">通知訊息（選填）</label><textarea id="notification-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={3} className="w-full rounded-xl border border-lion-border bg-lion-card px-3 py-3 text-base" placeholder="邀請好友一起參加活動" /></div>
      <div className="flex gap-2"><button type="button" onClick={resetForm} className="min-h-12 flex-1 rounded-xl border border-lion-border px-3 text-base">取消</button><button type="submit" disabled={!eventId || (recipientType === "selected" && !selected.length)} className="min-h-12 flex-1 rounded-xl bg-lion-action px-3 text-base font-semibold text-lion-navyDeep disabled:opacity-50">{sending ? "發送中…" : "確認發送"}</button></div>
    </fieldset></form>}
  </div></AppShell>;
}
