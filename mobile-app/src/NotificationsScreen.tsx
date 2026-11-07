import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createApiClient, ApiError, type NotificationItem, type FriendInvitation, type SentNotification } from "./contract";
import { canSendNotification, notificationSendCount, readNotificationComposeData, NOTIFICATION_MESSAGE_LIMIT, type NotificationEventOption, type NotificationFriendOption } from "./notification-contract";
import { EVENT_TIME_ZONE } from "../../src/lib/event-calendar";
import EventDetailScreen from "./EventDetailScreen";
import ReviewNotifications from "./ReviewNotifications";

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);
type Tab = "received" | "sent";
function formatDate(iso: string) {
  return new Date(iso).toLocaleString("zh-TW", { timeZone: EVENT_TIME_ZONE, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ComposeForm({ onClose, onSent, onCheckSent }: {
  onClose: () => void; onSent: (count: number) => void; onCheckSent: () => void;
}) {
  const [events, setEvents] = useState<NotificationEventOption[]>([]);
  const [friends, setFriends] = useState<NotificationFriendOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [eventId, setEventId] = useState("");
  const [recipientType, setRecipientType] = useState<"selected" | "organization">("selected");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const sendLock = useRef(false);

  const load = useCallback(async () => {
    const attempt = ++generation.current;
    setLoading(true); setReady(false); setError(null);
    try {
      const [eventData, friendData] = await Promise.all([api.getEvents(), api.getFriends()]);
      const data = readNotificationComposeData(eventData, friendData);
      if (generation.current !== attempt) return;
      setEvents(data.events); setFriends(data.friends);
      setEventId(current => data.events.some(event => event.id === current) ? current : data.events[0]?.id ?? "");
      setSelected(current => current.filter(id => data.friends.some(friend => friend.id === id)));
      setReady(true);
    } catch (failure) {
      if (generation.current === attempt) setError(failure instanceof ApiError ? failure.message : "活動或收件人資料尚未讀取完成，請重新讀取。");
    } finally { if (generation.current === attempt) setLoading(false); }
  }, []);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  const maySend = canSendNotification({ ready: ready && !uncertain, busy: sending, eventId, recipientType, selected, message });

  async function handleSubmit() {
    if (sendLock.current || !maySend) return;
    sendLock.current = true; setSending(true); setError(null);
    try {
      const result = await api.sendNotification({
        eventId, recipientType, memberIds: recipientType === "selected" ? selected : [],
        message: message.trim() || undefined,
      });
      const count = notificationSendCount(result);
      if (count === null) {
        setUncertain(true); setError("發送結果尚未確認。請先查看已發送紀錄，再決定是否重送。"); return;
      }
      onSent(count);
    } catch (failure) {
      const unknownResult = !(failure instanceof ApiError) || failure.status === undefined || failure.status >= 500;
      setUncertain(unknownResult);
      setError(unknownResult ? "連線或服務回覆未確認。請先查看已發送紀錄，再決定是否重送。" : failure.message);
    } finally { sendLock.current = false; setSending(false); }
  }

  return <div className="compose-form" aria-busy={loading || sending}>
    {loading ? <p className="member-meta" role="status">讀取活動與收件人中…</p> : null}
    {error ? <div><p className="error" role="alert">{error}</p>
      {!ready && !loading ? <button type="button" className="secondary" onClick={() => void load()}>重新讀取活動與好友</button> : null}
    </div> : null}
    {ready ? <>
      <div><label htmlFor="notify-event">選擇活動</label>
        <select id="notify-event" value={eventId} disabled={sending} onChange={event => setEventId(event.target.value)}>
          {!events.length ? <option value="">目前沒有可選的活動</option> : null}
          {events.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}
        </select>
      </div>
      <div><label>收件人</label><div className="tag-row">
        <button type="button" aria-pressed={recipientType === "selected"} disabled={sending} className={recipientType === "selected" ? "tag-chip active" : "tag-chip"} onClick={() => setRecipientType("selected")}>指定好友</button>
        <button type="button" aria-pressed={recipientType === "organization"} disabled={sending} className={recipientType === "organization" ? "tag-chip active" : "tag-chip"} onClick={() => setRecipientType("organization")}>整個分會</button>
      </div></div>
      {recipientType === "selected" ? <div className="list-stack" aria-label="通知收件人">
        <p className="member-meta">已選 {selected.length} 位好友</p>
        {!friends.length ? <p className="member-meta">目前沒有好友可選。</p> : null}
        {friends.map(friend => <button key={friend.id} type="button" disabled={sending} aria-pressed={selected.includes(friend.id)}
          className={selected.includes(friend.id) ? "list-card list-card-selected" : "list-card"}
          onClick={() => setSelected(current => current.includes(friend.id) ? current.filter(id => id !== friend.id) : [...current, friend.id])}>
          <span className="list-card-main"><span className="list-card-title">{friend.nickname || friend.name}</span>
            <span className="list-card-meta">{friend.chapter || "分會資料未提供"}</span></span>
          <span aria-hidden="true">{selected.includes(friend.id) ? "✓" : "○"}</span>
        </button>)}
      </div> : <p className="member-meta">將通知此活動主辦分會的現任會員；須具備相應管理權限或為活動建立者。</p>}
      <div><label htmlFor="notify-message">訊息（選填）</label>
        <textarea id="notify-message" rows={3} maxLength={NOTIFICATION_MESSAGE_LIMIT} disabled={sending}
          aria-describedby="notify-message-limit" value={message} onChange={event => setMessage(event.target.value)} placeholder="邀請你一起參加這場活動！" />
        <p id="notify-message-limit" className="member-meta">{message.length}／{NOTIFICATION_MESSAGE_LIMIT} 字</p>
      </div>
    </> : null}
    <div className="form-actions">
      <button type="button" className="secondary" onClick={onClose} disabled={sending}>取消</button>
      <button type="button" className="primary" onClick={() => void handleSubmit()} disabled={!maySend}>{sending ? "發送中…" : "發送通知"}</button>
    </div>
    {uncertain ? <button type="button" className="secondary" onClick={onCheckSent}>查看已發送紀錄</button> : null}
  </div>;
}

export default function NotificationsScreen({ onOpenProfile }: { onOpenProfile?: () => void }) {
  const [tab, setTab] = useState<Tab>("received");
  const [inbox, setInbox] = useState<NotificationItem[]>([]);
  const [invitations, setInvitations] = useState<FriendInvitation[]>([]);
  const [sent, setSent] = useState<SentNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [composing, setComposing] = useState(false);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const markLock = useRef(false);
  const respondLock = useRef(false);

  // Inner pages reuse the shell viewport too; tab-only scroll resets do not
  // cover compose/detail navigation from a scrolled notification list.
  useLayoutEffect(() => { screenRef.current?.closest(".shell-content")?.scrollTo(0, 0); }, [composing, openEventId, tab]);

  const load = useCallback(async () => {
    if (markLock.current || respondLock.current) return;
    const attempt = ++generation.current;
    setLoading(true); setError(null);
    try {
      const data = await api.getNotifications();
      if (generation.current !== attempt) return;
      setInbox(data.inbox); setInvitations(data.friendInvitations); setSent(data.notifications);
      setUnreadCount(data.unreadCount);
      // Opening the inbox must not silently mark it read.
    } catch (failure) {
      if (generation.current === attempt) setError(failure instanceof ApiError ? failure.message : "讀取通知失敗，請重新載入。");
    } finally { if (generation.current === attempt) setLoading(false); }
  }, []);
  useEffect(() => {
    void load(); const refresh = () => void load();
    window.addEventListener("lion-notifications-refresh", refresh);
    return () => { generation.current++; window.removeEventListener("lion-notifications-refresh", refresh); };
  }, [load]);

  async function markRead(ids: string[]) {
    if (markLock.current || respondLock.current || !ids.length) return;
    markLock.current = true; generation.current++; setLoading(false); setMarking(true); setError(null);
    const unique = [...new Set(ids)].slice(0, 100);
    try {
      await api.markNotificationsRead(unique);
      const changed = inbox.filter(item => !item.readAt && unique.includes(item.notificationId)).length;
      const now = new Date().toISOString();
      setInbox(current => current.map(item => unique.includes(item.notificationId) ? { ...item, readAt: item.readAt || now } : item));
      setUnreadCount(current => Math.max(0, current - changed));
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : "已讀狀態尚未確認，請重新載入。"); }
    finally { markLock.current = false; setMarking(false); }
  }
  async function respond(friendshipId: string, action: "accept" | "decline") {
    if (respondLock.current || markLock.current) return;
    respondLock.current = true; generation.current++; setLoading(false); setBusyId(friendshipId); setError(null);
    try {
      await api.respondFriend(friendshipId, action);
      setInvitations(current => current.filter(item => item.friendshipId !== friendshipId));
      setToast(action === "accept" ? "已成為好友" : "已拒絕邀請");
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : "回覆結果尚未確認，請重新載入邀請狀態。"); }
    finally { respondLock.current = false; setBusyId(null); }
  }
  function checkSent() { setComposing(false); setTab("sent"); void load(); }
  function refresh() { window.dispatchEvent(new Event("lion-notifications-refresh")); }
  const busy = marking || Boolean(busyId);
  const unreadIds = inbox.filter(item => !item.readAt).map(item => item.notificationId);

  return <div className="notifications-screen" ref={screenRef}>
    {openEventId ? <EventDetailScreen key={openEventId} eventId={openEventId} onBack={() => setOpenEventId(null)} /> : composing ? <>
      <h1 className="screen-title">發送通知</h1>
      <ComposeForm onClose={() => setComposing(false)} onCheckSent={checkSent} onSent={count => {
        setToast("已通知 " + count + " 位會員"); checkSent();
      }} />
    </> : <>
      <div className="screen-header"><h1 className="screen-title">通知</h1>
        <button type="button" className="my-screen-edit-button" disabled={busy} onClick={() => setComposing(true)}>＋ 發送通知</button>
      </div>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button type="button" className="secondary" disabled={loading || busy} onClick={refresh}>重新載入通知</button>
      <nav className="sub-tabs" aria-label="通知分類" role="tablist">
        <button type="button" id="notification-received-tab" role="tab" aria-controls="notification-panel" aria-selected={tab === "received"}
          className={tab === "received" ? "sub-tab active" : "sub-tab"} onClick={() => setTab("received")}>收到的通知{unreadCount ? "（" + unreadCount + " 未讀）" : ""}</button>
        <button type="button" id="notification-sent-tab" role="tab" aria-controls="notification-panel" aria-selected={tab === "sent"}
          className={tab === "sent" ? "sub-tab active" : "sub-tab"} onClick={() => setTab("sent")}>已發送</button>
      </nav>
      {loading ? <p className="member-meta" role="status">讀取通知中…</p> : null}
      <section id="notification-panel" role="tabpanel" aria-labelledby={tab === "received" ? "notification-received-tab" : "notification-sent-tab"} aria-busy={loading}>
        {tab === "received" ? <>
          <ReviewNotifications onOpenProfile={onOpenProfile} />
          <section><h2 className="section-title">好友邀請（{invitations.length} 待回覆）</h2>
            {!loading && !error && !invitations.length ? <p className="member-meta">目前沒有待回覆的好友邀請。</p> : null}
            <div className="list-stack">{invitations.map(invitation => <article key={invitation.friendshipId} className="list-card">
              <div className="list-card-main"><p className="list-card-title">{invitation.requester.nickname || invitation.requester.name}</p>
                <p className="list-card-meta">邀請您成為好友 · {formatDate(invitation.createdAt)}</p></div>
              <div className="list-card-actions">
                <button type="button" className="primary" disabled={busy} onClick={() => void respond(invitation.friendshipId, "accept")}>{busyId === invitation.friendshipId ? "處理中…" : "接受"}</button>
                <button type="button" className="secondary" disabled={busy} onClick={() => void respond(invitation.friendshipId, "decline")}>拒絕</button>
              </div>
            </article>)}</div>
          </section>
          <section><h2 className="section-title">活動通知</h2>
            {unreadIds.length ? <button type="button" className="secondary" disabled={busy} onClick={() => void markRead(unreadIds)}>{marking ? "更新中…" : "將這些通知標為已讀"}</button> : null}
            {!loading && !error && !inbox.length ? <p className="member-meta">目前沒有收到活動通知。</p> : null}
            <div className="list-stack">{inbox.map(item => <article key={item.id} className={item.readAt ? "list-card" : "list-card list-card-unread"}>
              <div className="list-card-main"><p className="list-card-title">{item.eventTitle}</p>
                <p className="list-card-meta">{item.sender.nickname || item.sender.name} · {formatDate(item.sentAt)} · {item.readAt ? "已讀" : "未讀"}</p>
                <p className="list-card-message">{item.message || "邀請您查看這場活動"}</p>
                <div className="form-actions">
                  <button type="button" className="primary" onClick={() => {
                    setOpenEventId(item.eventId);
                    if (!item.readAt) void markRead([item.notificationId]);
                  }}>查看活動</button>
                  {!item.readAt ? <button type="button" className="secondary" disabled={busy} onClick={() => void markRead([item.notificationId])}>標為已讀</button> : null}
                </div>
              </div>
            </article>)}</div>
          </section>
        </> : <>
          {!loading && !error && !sent.length ? <p className="member-meta">尚未發送活動通知。</p> : null}
          <div className="list-stack">{sent.map(item => <article key={item.id} className="list-card">
            <div className="list-card-main"><p className="list-card-title">{item.eventTitle}</p><p className="list-card-meta">{formatDate(item.sentAt)}</p>
              <p className="list-card-message">{item.message}</p><p className="list-card-meta">已通知：{item.recipients.join("、")}</p></div>
          </article>)}</div>
        </>}
      </section>
    </>}
  </div>;
}
