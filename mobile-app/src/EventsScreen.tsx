import { useCallback, useEffect, useState } from "react";
import { createApiClient, ApiError, type EventCard, type Member } from "./contract";

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("zh-TW", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function EventsScreen({ member: _member }: { member: Member }) {
  const [events, setEvents] = useState<EventCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEvents(await api.getEvents());
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "讀取活動失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleToggle(eventId: string) {
    setBusyId(eventId);
    try {
      await api.toggleEventRegistration(eventId);
      await load();
      setToast("已更新報名狀態");
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "操作失敗，請再試一次");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="member-meta">載入中…</p>;

  return (
    <div className="events-screen">
      {toast ? <div className="toast" role="status">{toast}</div> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {events.length === 0 ? <p className="member-meta">目前沒有可參加的活動。</p> : null}
      <div className="list-stack">
        {events.map((ev) => (
          <div key={ev.id} className="event-card">
            <p className="list-card-title">{ev.title}</p>
            <p className="list-card-meta">{formatDate(ev.startAt)} · {ev.location}</p>
            <p className="list-card-meta">{ev.hostChapter} · 已報名 {ev.registeredCount}{ev.capacity ? `／${ev.capacity}` : ""}</p>
            <button
              type="button"
              className={ev.isRegistered ? "secondary" : "primary"}
              disabled={busyId === ev.id || (!ev.isRegistered && ev.isFull)}
              onClick={() => handleToggle(ev.id)}
            >
              {busyId === ev.id ? "處理中…" : ev.isRegistered ? "取消報名" : ev.isFull ? "名額已滿" : "報名參加"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
