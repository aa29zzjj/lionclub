import { useEffect, useState } from "react";
import { createApiClient, ApiError, type Member, type FriendCard, type EventCard } from "./contract";
import Avatar from "./Avatar";
import { QRCodeSVG } from "qrcode.react";
import { createFriendQrPayload } from "../../src/lib/friend-qr";
import { colorFromId } from "../../src/lib/avatar-color";
import { formatJoinDate } from "../../src/lib/experience-data";
import { partitionEvents } from "../../src/lib/event-list";
import { EVENT_TIME_ZONE } from "../../src/lib/event-calendar";
import { BellIcon, QrIcon, PinIcon } from "../../src/components/icons";
import logoAsset from "./lions-logo.png";
// Next.js's repo-wide "*.png" ambient type says StaticImageData, but esbuild's
// dataurl loader actually emits a plain string at runtime.
const logo = logoAsset as unknown as string;

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

const EVENT_GRADIENTS = ["g0", "g1", "g2"];

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleString("zh-TW", {
    timeZone: EVENT_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HomeScreen({
  member,
  onOpenProfile,
  onOpenNotifications,
  onOpenFriends,
  onOpenEvents,
}: {
  member: Member;
  onOpenProfile: () => void;
  onOpenNotifications: () => void;
  onOpenFriends: () => void;
  onOpenEvents: () => void;
}) {
  const [friends, setFriends] = useState<FriendCard[]>([]);
  const [incomingCount, setIncomingCount] = useState(0);
  const [events, setEvents] = useState<EventCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getFriends(), api.getEvents()])
      .then(([friendsData, eventsData]) => {
        if (cancelled) return;
        setFriends(friendsData.friends);
        setIncomingCount(friendsData.incoming.length);
        setEvents(eventsData);
      })
      .catch((failure) => {
        if (cancelled) return;
        setError(failure instanceof ApiError ? failure.message : "讀取首頁資料失敗");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const upcomingEvents = partitionEvents(events, now).upcoming;

  return (
    <div className="dashboard">
      {error ? <p className="error" role="alert">{error}</p> : null}

      <div className="dashboard-header">
        <div className="dashboard-brand">
          <span className="dashboard-brand-badge">
            <img src={logo} alt="Lions Clubs International" />
          </span>
          <span>獅子會</span>
        </div>
        <button type="button" className="dashboard-bell" onClick={onOpenNotifications} aria-label="通知">
          <BellIcon className="icon-18" />
        </button>
      </div>

      <button type="button" className="dashboard-greeting" onClick={onOpenProfile}>
        <Avatar name={member.name} color={colorFromId(member.id)} imageUrl={member.photoUrl} size={36} />
        <span>
          <p className="dashboard-greeting-hi">嗨，歡迎回來</p>
          <p className="dashboard-greeting-name">{member.name}</p>
        </span>
      </button>

      <div className="member-card">
        <div className="member-card-glow" />
        <div className="member-card-label">
          <span className="member-card-label-badge">
            <img src={logo} alt="Lions Clubs International" />
          </span>
          <span className="member-card-label-text">LIONS CLUBS · 數位會員證</span>
        </div>
        <div className="member-card-identity">
          <Avatar name={member.name} color={colorFromId(member.id)} imageUrl={member.photoUrl} size={44} />
          <div>
            <p className="member-card-identity-name">{member.name}</p>
            <p className="member-card-identity-meta">
              {member.organization?.name ?? "尚未分派分會"} · {member.title ?? "會員"}
            </p>
          </div>
        </div>
        <dl className="member-card-facts">
          <div>
            <dt>會員編號</dt>
            <dd>{member.memberNo || "—"}</dd>
          </div>
          <div>
            <dt>入會年度</dt>
            <dd>{formatJoinDate(member.joinYear, member.joinMonth) ?? "—"}</dd>
          </div>
        </dl>
        <button type="button" className="member-card-qr-button" onClick={() => setShowQr(true)}>
          <p className="member-card-qr-text">掃描條碼供活動報到、資源媒合驗證身分</p>
          <span className="member-card-qr-icon">
            <QrIcon className="icon-20" />
          </span>
        </button>
      </div>

      {showQr ? (
        <div className="qr-overlay" role="dialog" aria-label="我的會員證 QR Code">
          <div className="qr-panel">
            <QRCodeSVG value={createFriendQrPayload(member.id)} size={220} bgColor="#ffffff" fgColor="#0a0d18" />
            <p className="member-meta" style={{ marginTop: "1rem" }}>
              {member.name} · {member.organization?.name ?? ""}
            </p>
            <button type="button" className="secondary" onClick={() => setShowQr(false)}>
              關閉
            </button>
          </div>
        </div>
      ) : null}

      <div className="stat-grid">
        <button type="button" className="stat-tile" onClick={onOpenFriends}>
          <p className="stat-tile-value">{friends.length}</p>
          <p className="stat-tile-label">好友</p>
        </button>
        <button type="button" className="stat-tile" onClick={onOpenFriends}>
          <p className="stat-tile-value">{incomingCount}</p>
          <p className="stat-tile-label">待確認邀請</p>
        </button>
        <button type="button" className="stat-tile" onClick={onOpenEvents}>
          <p className="stat-tile-value">{upcomingEvents.length}</p>
          <p className="stat-tile-label">即將舉辦</p>
        </button>
      </div>

      <div className="section-header">
        <h2>即將舉辦的活動</h2>
        <button type="button" onClick={onOpenEvents}>
          查看全部
        </button>
      </div>
      {loading ? <p className="member-meta">載入中…</p> : null}
      <div className="event-list">
        {!loading && upcomingEvents.length === 0 ? <p className="member-meta">目前沒有即將舉辦的活動。</p> : null}
        {upcomingEvents.slice(0, 2).map((ev, i) => (
          <button key={ev.id} type="button" className="event-tile" onClick={onOpenEvents}>
            <div className="event-tile-head">
              <Avatar name={ev.hostChapter} color="#3D5A99" size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="event-tile-title">{ev.title}</p>
                <p className="event-tile-when">{formatEventDate(ev.startAt)}</p>
              </div>
            </div>
            {ev.coverPhotoUrl ? (
              <img src={ev.coverPhotoUrl} alt="" className="event-tile-poster" />
            ) : (
              <div className={`event-tile-poster-fallback ${EVENT_GRADIENTS[i % EVENT_GRADIENTS.length]}`} />
            )}
            <div className="event-tile-foot">
              <p className="event-tile-location">
                <PinIcon className="icon-14" /> {ev.location}
              </p>
              <span className="event-tile-link">查看詳情 →</span>
            </div>
          </button>
        ))}
      </div>

      <div className="section-header">
        <h2>好友動態</h2>
        <button type="button" onClick={onOpenFriends}>
          {friends.length} 位好友
        </button>
      </div>
      <div className="friend-strip">
        {friends.map((f) => (
          <button key={f.id} type="button" className="friend-strip-item" onClick={onOpenFriends}>
            <Avatar name={f.name} color={colorFromId(f.id)} imageUrl={f.photoUrl} size={52} />
            <p className="friend-strip-name">{f.nickname || f.name}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
