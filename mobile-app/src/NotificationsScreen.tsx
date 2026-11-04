import { useCallback, useEffect, useState } from "react";
import { createApiClient, ApiError, type NotificationItem, type FriendInvitation, type SentNotification, type EventCard, type FriendCard } from "./contract";

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

type Tab = "received" | "sent";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("zh-TW", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ComposeForm({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [events, setEvents] = useState<EventCard[]>([]);
  const [friends, setFriends] = useState<FriendCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventId, setEventId] = useState("");
  const [recipientType, setRecipientType] = useState<"selected" | "organization">("selected");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getEvents(), api.getFriends()])
      .then(([eventsData, friendsData]) => {
        setEvents(eventsData);
        setFriends(friendsData.friends);
        setEventId((current) => current || eventsData[0]?.id || "");
      })
      .catch((failure) => setError(failure instanceof ApiError ? failure.message : "讀取資料失敗"))
      .finally(() => setLoading(false));
  }, []);

  function toggleSelected(memberId: string) {
    setSelected((prev) => (prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]));
  }

  async function handleSubmit() {
    if (sending || !eventId || (recipientType === "selected" && selected.length === 0)) return;
    setSending(true);
    setError(null);
    try {
      const result = await api.sendNotification({ eventId, recipientType, memberIds: selected, message: message.trim() || undefined });
      onSent();
      onClose();
      void result;
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "發送失敗，請重試");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <p className="member-meta">載入中…</p>;

  return (
    <div className="compose-form">
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div>
        <label htmlFor="notify-event">選擇活動</label>
        <select id="notify-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          {events.length === 0 ? <option value="">目前沒有可選的活動</option> : null}
          {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
        </select>
      </div>

      <div>
        <label>收件人</label>
        <div className="tag-row">
          <button type="button" className={recipientType === "selected" ? "tag-chip active" : "tag-chip"} onClick={() => setRecipientType("selected")}>指定好友</button>
          <button type="button" className={recipientType === "organization" ? "tag-chip active" : "tag-chip"} onClick={() => setRecipientType("organization")}>整個分會</button>
        </div>
      </div>

      {recipientType === "selected" ? (
        <div className="list-stack">
          {friends.length === 0 ? <p className="member-meta">目前沒有好友可選。</p> : null}
          {friends.map((f) => (
            <button
              key={f.id}
              type="button"
              className={selected.includes(f.id) ? "list-card list-card-selected" : "list-card"}
              onClick={() => toggleSelected(f.id)}
            >
              <div className="list-card-main">
                <p className="list-card-title">{f.nickname || f.name}</p>
                <p className="list-card-meta">{f.chapter}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="member-meta">將通知您的分會所有現任會員（僅限活動建立者或幹部）。</p>
      )}

      <div>
        <label htmlFor="notify-message">訊息（選填）</label>
        <textarea id="notify-message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="邀請你一起參加這場活動！" />
      </div>

      <div className="form-actions">
        <button type="button" className="secondary" onClick={onClose} disabled={sending}>取消</button>
        <button type="button" className="primary" onClick={handleSubmit} disabled={sending || !eventId}>{sending ? "發送中…" : "發送通知"}</button>
      </div>
    </div>
  );
}

export default function NotificationsScreen() {
  const [tab, setTab] = useState<Tab>("received");
  const [inbox, setInbox] = useState<NotificationItem[]>([]);
  const [invitations, setInvitations] = useState<FriendInvitation[]>([]);
  const [sent, setSent] = useState<SentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getNotifications();
      // The "notifications" (sent-list) field only exists on API versions that
      // include the notification-send feature; defend against an older/partial
      // backend deploy omitting it (or other fields) and leaving these undefined.
      setInbox(data.inbox ?? []);
      setInvitations(data.friendInvitations ?? []);
      setSent(data.notifications ?? []);
      const unread = (data.inbox ?? []).filter((n) => !n.readAt).map((n) => n.notificationId);
      if (unread.length > 0) void api.markNotificationsRead(unread);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "讀取通知失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleRespond(friendshipId: string, action: "accept" | "decline") {
    setBusyId(friendshipId);
    try {
      await api.respondFriend(friendshipId, action);
      setInvitations((prev) => prev.filter((inv) => inv.friendshipId !== friendshipId));
      setToast(action === "accept" ? "已成為好友" : "已拒絕邀請");
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "回覆邀請失敗");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="member-meta">載入中…</p>;

  if (composing) {
    return (
      <div className="notifications-screen">
        <h1 className="screen-title">發送通知</h1>
        <ComposeForm onClose={() => setComposing(false)} onSent={() => { setToast("已發送通知"); void load(); }} />
      </div>
    );
  }

  return (
    <div className="notifications-screen">
      <div className="screen-header">
        <h1 className="screen-title">通知</h1>
        <button type="button" className="my-screen-edit-button" onClick={() => setComposing(true)}>＋ 發送通知</button>
      </div>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}

      <nav className="sub-tabs">
        <button type="button" className={tab === "received" ? "sub-tab active" : "sub-tab"} onClick={() => setTab("received")}>收到的通知</button>
        <button type="button" className={tab === "sent" ? "sub-tab active" : "sub-tab"} onClick={() => setTab("sent")}>已發送</button>
      </nav>

      {tab === "received" ? (
        <>
          <section>
            <h2 className="section-title">好友邀請（{invitations.length} 待回覆）</h2>
            {invitations.length === 0 ? <p className="member-meta">目前沒有待回覆的好友邀請。</p> : null}
            <div className="list-stack">
              {invitations.map((inv) => (
                <div key={inv.friendshipId} className="list-card">
                  <div className="list-card-main">
                    <p className="list-card-title">{inv.requester.nickname || inv.requester.name}</p>
                    <p className="list-card-meta">邀請您成為好友 · {formatDate(inv.createdAt)}</p>
                  </div>
                  <div className="list-card-actions">
                    <button type="button" className="primary" disabled={busyId === inv.friendshipId} onClick={() => handleRespond(inv.friendshipId, "accept")}>接受</button>
                    <button type="button" className="secondary" disabled={busyId === inv.friendshipId} onClick={() => handleRespond(inv.friendshipId, "decline")}>拒絕</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="section-title">活動通知</h2>
            {inbox.length === 0 ? <p className="member-meta">目前沒有收到活動通知。</p> : null}
            <div className="list-stack">
              {inbox.map((n) => (
                <div key={n.id} className={n.readAt ? "list-card" : "list-card list-card-unread"}>
                  <div className="list-card-main">
                    <p className="list-card-title">{n.eventTitle}</p>
                    <p className="list-card-meta">{n.sender.nickname || n.sender.name} · {formatDate(n.sentAt)}</p>
                    <p className="list-card-message">{n.message || "邀請您查看這場活動"}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section>
          {sent.length === 0 ? <p className="member-meta">尚未發送活動通知。</p> : null}
          <div className="list-stack">
            {sent.map((n) => (
              <div key={n.id} className="list-card">
                <div className="list-card-main">
                  <p className="list-card-title">{n.eventTitle}</p>
                  <p className="list-card-meta">{formatDate(n.sentAt)}</p>
                  <p className="list-card-message">{n.message}</p>
                  <p className="list-card-meta">已通知：{(n.recipients ?? []).join("、")}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
