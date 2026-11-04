import { useCallback, useEffect, useState } from "react";
import { Camera } from "@capacitor/camera";
import { createApiClient, ApiError, uploadToPresignedUrl, type EventCard, type EventPublishingOption, type Member } from "./contract";
import { partitionEvents } from "../../src/lib/event-list";
import { EVENT_TIME_ZONE } from "../../src/lib/event-calendar";
import EventDetailScreen from "./EventDetailScreen";

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

const EVENT_GRADIENTS = ["g0", "g1", "g2"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("zh-TW", {
    timeZone: EVENT_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** YYYY-MM-DD + HH:mm (Taiwan time) -> ISO instant, matching the website's taipeiEventStartAt. */
function taipeiEventStartAt(date: string, time: string): string | null {
  if (!date || !time) return null;
  const iso = new Date(`${date}T${time}:00+08:00`);
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString();
}

function CreateEventForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [loading, setLoading] = useState(true);
  const [allowedScopes, setAllowedScopes] = useState<string[]>([]);
  const [officialHosts, setOfficialHosts] = useState<EventPublishingOption[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"PERSONAL" | "CLUB_OFFICIAL">("PERSONAL");
  const [hostOrganizationId, setHostOrganizationId] = useState("");
  const [coverPhoto, setCoverPhoto] = useState<{ webPath: string; blob: Blob; contentType: string } | null>(null);
  const [capturingPhoto, setCapturingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getEventsFull()
      .then((data) => {
        setAllowedScopes(data.allowedScopes);
        setOfficialHosts(data.officialHosts);
        setHostOrganizationId((current) => current || data.officialHosts[0]?.hostOrganizationId || "");
      })
      .catch((failure) => setError(failure instanceof ApiError ? failure.message : "讀取活動設定失敗"))
      .finally(() => setLoading(false));
  }, []);

  async function handlePickCoverPhoto() {
    setCapturingPhoto(true);
    setError(null);
    try {
      const photo = await Camera.takePhoto({ quality: 80 });
      if (!photo.webPath) return;
      const blob = await fetch(photo.webPath).then((r) => r.blob());
      const contentType = blob.type || "image/jpeg";
      setCoverPhoto({ webPath: photo.webPath, blob, contentType });
    } catch {
      /* user cancelled the camera sheet */
    } finally {
      setCapturingPhoto(false);
    }
  }

  async function handleSubmit() {
    const startAt = taipeiEventStartAt(date, time);
    if (!title.trim() || !location.trim() || !startAt) {
      setError("請填寫活動名稱、地點與正確的日期時間");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let coverPhotoUrl: string | undefined;
      if (coverPhoto) {
        const sign = await api.createEventCoverUpload(coverPhoto.contentType, coverPhoto.blob.size);
        await uploadToPresignedUrl(sign.uploadUrl, coverPhoto.contentType, coverPhoto.blob);
        coverPhotoUrl = sign.coverPhotoUrl;
      }
      await api.createEvent({
        title: title.trim(),
        startAt,
        location: location.trim(),
        capacity: capacity ? Number(capacity) : undefined,
        description: description.trim() || undefined,
        coverPhotoUrl,
        category,
        scope: category === "CLUB_OFFICIAL" ? "CLUB" : undefined,
        hostOrganizationId: category === "CLUB_OFFICIAL" ? hostOrganizationId : undefined,
      });
      onCreated();
      onClose();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "發布失敗，請重試");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="member-meta">載入中…</p>;

  return (
    <div className="compose-form">
      {error ? <p className="error" role="alert">{error}</p> : null}

      <div>
        <label htmlFor="ev-title">活動名稱</label>
        <input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：秋季聯合例會" />
      </div>

      <div>
        <label htmlFor="ev-date">日期（台灣時間）</label>
        <input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div>
        <label htmlFor="ev-time">時間</label>
        <input id="ev-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>

      <div>
        <label htmlFor="ev-location">地點</label>
        <input id="ev-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="例如：台北市 內湖大湖公園" />
      </div>

      <div>
        <label htmlFor="ev-capacity">名額上限（選填）</label>
        <input id="ev-capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="不限制請留空" />
      </div>

      <div>
        <label htmlFor="ev-description">活動說明（選填）</label>
        <textarea id="ev-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div>
        <label>活動類型</label>
        <div className="tag-row">
          <button type="button" className={category === "PERSONAL" ? "tag-chip active" : "tag-chip"} onClick={() => setCategory("PERSONAL")}>個人活動</button>
          {allowedScopes.length > 0 ? (
            <button type="button" className={category === "CLUB_OFFICIAL" ? "tag-chip active" : "tag-chip"} onClick={() => setCategory("CLUB_OFFICIAL")}>分會官方活動</button>
          ) : null}
        </div>
      </div>

      {category === "CLUB_OFFICIAL" && officialHosts.length > 0 ? (
        <div>
          <label htmlFor="ev-host">主辦單位</label>
          <select id="ev-host" value={hostOrganizationId} onChange={(e) => setHostOrganizationId(e.target.value)}>
            {officialHosts.map((host) => (
              <option key={host.hostOrganizationId} value={host.hostOrganizationId}>{host.hostOrganizationName}</option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label>封面照片（選填）</label>
        {coverPhoto ? (
          <img src={coverPhoto.webPath} alt="" className="event-card-poster" />
        ) : null}
        <button type="button" className="secondary" onClick={handlePickCoverPhoto} disabled={capturingPhoto}>
          {capturingPhoto ? "開啟相機中…" : coverPhoto ? "重新拍攝封面照片" : "拍攝封面照片"}
        </button>
      </div>

      <div className="form-actions">
        <button type="button" className="secondary" onClick={onClose} disabled={submitting}>取消</button>
        <button type="button" className="primary" onClick={handleSubmit} disabled={submitting}>{submitting ? "發布中…" : "發布活動"}</button>
      </div>
    </div>
  );
}

export default function EventsScreen({ member: _member }: { member: Member }) {
  const [events, setEvents] = useState<EventCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openEventId, setOpenEventId] = useState<string | null>(null);

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

  if (openEventId) {
    return <EventDetailScreen eventId={openEventId} onBack={() => { setOpenEventId(null); void load(); }} />;
  }

  if (creating) {
    return (
      <div className="events-screen">
        <h1 className="screen-title">發布活動</h1>
        <CreateEventForm onClose={() => setCreating(false)} onCreated={() => { setToast("已發布活動"); void load(); }} />
      </div>
    );
  }

  const { upcoming, past } = partitionEvents(events);

  function renderCard(ev: EventCard, i: number) {
    return (
      <div key={ev.id} className="event-card">
        <button type="button" onClick={() => setOpenEventId(ev.id)} style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}>
          <p className="list-card-title">{ev.title}</p>
          <p className="list-card-meta">{formatDate(ev.startAt)}（台灣時間） · {ev.location}</p>
          <p className="list-card-meta">{ev.hostChapter} · 已報名 {ev.registeredCount}{ev.capacity ? `／${ev.capacity}` : ""}</p>
        </button>
        {ev.coverPhotoUrl ? (
          <img src={ev.coverPhotoUrl} alt="" className="event-card-poster" />
        ) : (
          <div className={`event-card-poster-fallback ${EVENT_GRADIENTS[i % EVENT_GRADIENTS.length]}`} />
        )}
        <button
          type="button"
          className={ev.isRegistered ? "secondary" : "primary"}
          disabled={busyId === ev.id || (!ev.isRegistered && ev.isFull)}
          onClick={() => handleToggle(ev.id)}
        >
          {busyId === ev.id ? "處理中…" : ev.isRegistered ? "取消報名" : ev.isFull ? "名額已滿" : "報名參加"}
        </button>
      </div>
    );
  }

  return (
    <div className="events-screen">
      <div className="screen-header">
        <h1 className="screen-title">活動</h1>
        <button type="button" className="my-screen-edit-button" onClick={() => setCreating(true)}>＋ 發布活動</button>
      </div>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}

      <section>
        <h2 className="section-title">即將舉辦（{upcoming.length}）</h2>
        {upcoming.length === 0 ? <p className="member-meta">目前沒有即將舉辦的活動。</p> : null}
        <div className="list-stack">{upcoming.map(renderCard)}</div>
      </section>

      {past.length > 0 ? (
        <section>
          <h2 className="section-title">已開始／過往活動（{past.length}）</h2>
          <div className="list-stack">{past.map(renderCard)}</div>
        </section>
      ) : null}
    </div>
  );
}
