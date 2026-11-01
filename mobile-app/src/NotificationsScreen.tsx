import { useCallback, useEffect, useState } from "react";
import { createApiClient, ApiError, type NotificationItem, type FriendInvitation } from "./contract";

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("zh-TW", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function NotificationsScreen() {
  const [inbox, setInbox] = useState<NotificationItem[]>([]);
  const [invitations, setInvitations] = useState<FriendInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getNotifications();
      setInbox(data.inbox);
      setInvitations(data.friendInvitations);
      const unread = data.inbox.filter((n) => !n.readAt).map((n) => n.notificationId);
      if (unread.length > 0) void api.markNotificationsRead(unread);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "讀取通知失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <p className="member-meta">載入中…</p>;

  return (
    <div className="notifications-screen">
      {error ? <p className="error" role="alert">{error}</p> : null}

      {invitations.length > 0 ? (
        <div className="list-stack">
          <p className="member-meta">待回覆的好友邀請,請到「好友」頁面處理</p>
          {invitations.map((inv) => (
            <div key={inv.friendshipId} className="list-card">
              <div className="list-card-main">
                <p className="list-card-title">{inv.requester.nickname || inv.requester.name}</p>
                <p className="list-card-meta">想加您為好友 · {formatDate(inv.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="list-stack">
        {inbox.length === 0 ? <p className="member-meta">目前沒有活動通知。</p> : null}
        {inbox.map((n) => (
          <div key={n.id} className="list-card">
            <div className="list-card-main">
              <p className="list-card-title">{n.eventTitle}</p>
              <p className="list-card-meta">{n.sender.nickname || n.sender.name}：{n.message}</p>
              <p className="list-card-meta">{formatDate(n.sentAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
