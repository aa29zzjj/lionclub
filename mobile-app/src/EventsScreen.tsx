import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Camera } from "@capacitor/camera";
import { createApiClient, ApiError, uploadToPresignedUrl, type EventCard, type Member } from "./contract";
import { partitionEvents } from "../../src/lib/event-list";
import { EVENT_TIME_ZONE } from "../../src/lib/event-calendar";
import EventDetailScreen from "./EventDetailScreen";
import TermsConsentPrompt from "./TermsConsentPrompt";
import {
  EVENT_CAPACITY_MAX, EventDraftError, EventPublishCancelled, EventPublicationUnknown,
  createEventSubmissionLock, eventPublicationKey, eventPublicationLabels, isEventCameraCancellation,
  publishEventDraft, readEventCameraPhoto, readEventCards, readEventPublishingOptions,
  type EventCover, type EventPublicationOption,
} from "./event-draft";

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);
const EVENT_GRADIENTS = ["g0", "g1", "g2"];
const safeMessage = (failure: unknown, fallback: string) =>
  failure instanceof ApiError || failure instanceof EventDraftError || failure instanceof EventPublicationUnknown ? failure.message : fallback;

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("zh-TW", {
    timeZone: EVENT_TIME_ZONE, month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit",
  });
}

function CreateEventForm({ memberId, onClose, onCreated }: { memberId: string; onClose: (uncertain: boolean) => void; onCreated: () => void }) {
  const [loading, setLoading] = useState(true);
  const [optionsKnown, setOptionsKnown] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [officialHosts, setOfficialHosts] = useState<EventPublicationOption[]>([]);
  const [publicationKey, setPublicationKey] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"PERSONAL" | "CLUB_OFFICIAL">("PERSONAL");
  const [coverPhoto, setCoverPhoto] = useState<EventCover | null>(null);
  const [capturingPhoto, setCapturingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [needsTerms, setNeedsTerms] = useState(false);
  const [publicationUnknown, setPublicationUnknown] = useState(false);
  const mounted = useRef(true);
  const owner = useRef(memberId);
  owner.current = memberId;
  const lifecycle = useRef(0);
  const optionRequest = useRef(0);
  const photoLock = useRef(false);
  const submitLock = useRef(createEventSubmissionLock());
  const ownerSession = useRef(api.captureSessionGuard());
  const active = useCallback(() => mounted.current && owner.current === memberId && ownerSession.current(), [memberId]);

  const loadOptions = useCallback(async () => {
    if (!active() || submitLock.current.isBusy() || photoLock.current) return;
    const attempt = ++optionRequest.current, life = lifecycle.current, sessionCurrent = api.captureSessionGuard();
    const current = () => active() && lifecycle.current === life && optionRequest.current === attempt && sessionCurrent();
    setLoading(true); setOptionsError(null); setOptionsKnown(false);
    try {
      const data = await api.getEventsFull();
      if (!current()) return;
      const options = readEventPublishingOptions(data);
      setOfficialHosts(options);
      setPublicationKey(previous => options.some(option => eventPublicationKey(option) === previous) ? previous : "");
      setOptionsKnown(true);
    } catch (failure) {
      if (current()) setOptionsError(safeMessage(failure, "活動發布設定未讀取完成，請重新讀取；草稿仍保留。"));
    } finally { if (current()) setLoading(false); }
  }, [active]);

  useEffect(() => {
    mounted.current = true; void loadOptions();
    return () => { mounted.current = false; lifecycle.current++; optionRequest.current++; };
  }, [loadOptions]);

  function close(confirmed = false) {
    lifecycle.current++; optionRequest.current++;
    onClose(!confirmed && (submitLock.current.isBusy() || publicationUnknown));
  }

  async function handlePickCoverPhoto() {
    if (!active() || photoLock.current || submitLock.current.isBusy() || loading || !optionsKnown || publicationUnknown) return;
    photoLock.current = true;
    const life = lifecycle.current, sessionCurrent = api.captureSessionGuard();
    const current = () => active() && lifecycle.current === life && sessionCurrent();
    setCapturingPhoto(true); setError(null); setNotice(null);
    try {
      const photo = await Camera.takePhoto({ quality: 80, targetWidth: 1600, targetHeight: 1600 });
      if (!current()) return;
      const cover = await readEventCameraPhoto({ photo, pageHref: window.location.href, fetcher: fetch, isCurrent: current });
      if (current()) setCoverPhoto(cover);
    } catch (failure) {
      if (!current() || failure instanceof EventPublishCancelled) return;
      if (isEventCameraCancellation(failure)) setNotice("已取消拍攝；原先選擇的封面照片保持不變。");
      else setError(safeMessage(failure, "無法取得或讀取照片。請確認相機權限後重試；原先封面仍保留。"));
    } finally { photoLock.current = false; if (current()) setCapturingPhoto(false); }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!active() || loading || !optionsKnown || photoLock.current || needsTerms || publicationUnknown) return;
    await submitLock.current.run(async () => {
      const life = lifecycle.current, sessionCurrent = api.captureSessionGuard();
      const current = () => active() && lifecycle.current === life && sessionCurrent();
      setSubmitting(true); setError(null); setNotice(null);
      try {
        await publishEventDraft({
          draft: { title, date, time, location, capacity, description, category, publicationKey },
          options: officialHosts, cover: coverPhoto, isCurrent: current, api, upload: uploadToPresignedUrl,
        });
        if (!current()) return;
        onCreated(); close(true);
      } catch (failure) {
        if (!current() || failure instanceof EventPublishCancelled) return;
        if (failure instanceof ApiError && failure.code === "TERMS_REQUIRED") {
          setNeedsTerms(true); setError(null);
        } else {
          if (failure instanceof EventPublicationUnknown) setPublicationUnknown(true);
          setError(safeMessage(failure, "尚未完成發布，草稿仍保留。請確認資料與連線後再操作。"));
        }
      } finally { if (current()) setSubmitting(false); }
    });
  }

  return (
    <div className="compose-form">
      <div className="screen-header">
        <h1 className="screen-title">發布活動</h1>
        <button type="button" className="secondary" onClick={() => close()}>返回活動列表</button>
      </div>
      {submitting && <p role="status" className="member-meta">發布處理中。離開畫面會停止後續步驟，但不會撤回已送出的要求；請回列表核對結果。</p>}
      {loading && <p className="member-meta" role="status">正在讀取可發布的層級與主辦單位…</p>}
      {optionsError && <p className="error" role="alert">{optionsError}</p>}
      <button type="button" className="secondary" disabled={submitting || capturingPhoto} onClick={() => void loadOptions()}>{loading ? "重新讀取發布設定" : "重新確認發布權限（保留草稿）"}</button>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="member-meta" role="status">{notice}</p>}
      {publicationUnknown && <p className="member-meta">沒有自動重送，也不能視為發布失敗。請先返回活動列表重新讀取並核對；若仍無法確認，請聯絡客服。</p>}
      {needsTerms ? <TermsConsentPrompt memberId={memberId} onCancel={() => { if (active()) setNeedsTerms(false); }} onAccepted={() => {
        if (!active()) return;
        setNeedsTerms(false); setNotice("條款已確認。草稿仍保留，請再次按「發布活動」才會送出。");
      }} /> : <form onSubmit={handleSubmit} className="compose-form" aria-busy={submitting || capturingPhoto}>
        <fieldset disabled={submitting || capturingPhoto || loading || !optionsKnown || publicationUnknown} className="compose-form" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div><label htmlFor="ev-title">活動名稱（最多 160 字）</label><input id="ev-title" required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：秋季聯合例會" /></div>
          <div><label htmlFor="ev-date">日期（台灣時間）</label><input id="ev-date" required type="date" value={date} onChange={event => setDate(event.target.value)} /></div>
          <div><label htmlFor="ev-time">時間（台灣時間）</label><input id="ev-time" required type="time" value={time} onChange={event => setTime(event.target.value)} /></div>
          <div><label htmlFor="ev-location">地點（最多 240 字）</label><input id="ev-location" required maxLength={240} value={location} onChange={event => setLocation(event.target.value)} placeholder="例如：台北市 內湖大湖公園" /></div>
          <div><label htmlFor="ev-capacity">名額上限（選填）</label><input id="ev-capacity" type="number" inputMode="numeric" min={1} max={EVENT_CAPACITY_MAX} step={1} value={capacity} onChange={event => setCapacity(event.target.value)} placeholder="不限制請留空" /></div>
          <div><label htmlFor="ev-description">活動說明（選填，最多 3000 字）</label><textarea id="ev-description" rows={3} maxLength={3000} value={description} onChange={event => setDescription(event.target.value)} /></div>
          <div>
            <p className="member-meta">活動類型</p>
            <div className="tag-row">
              <button type="button" aria-pressed={category === "PERSONAL"} className={category === "PERSONAL" ? "tag-chip active" : "tag-chip"} onClick={() => setCategory("PERSONAL")}>個人活動</button>
              {officialHosts.length > 0 && <button type="button" aria-pressed={category === "CLUB_OFFICIAL"} className={category === "CLUB_OFFICIAL" ? "tag-chip active" : "tag-chip"} onClick={() => setCategory("CLUB_OFFICIAL")}>官方活動（依授權）</button>}
            </div>
            {optionsKnown && !officialHosts.length && <p className="member-meta">目前沒有官方發布權限；自填職稱或資歷不會授予發布權限。</p>}
          </div>
          {category === "CLUB_OFFICIAL" && <div>
            <label htmlFor="ev-publication">官方發布層級與主辦單位</label>
            <select id="ev-publication" required value={publicationKey} onChange={event => setPublicationKey(event.target.value)}>
              <option value="">請選擇已授權的層級與主辦單位</option>
              {officialHosts.map(option => <option key={eventPublicationKey(option)} value={eventPublicationKey(option)}>{eventPublicationLabels[option.scope] + " · " + option.hostOrganizationName}</option>)}
            </select>
          </div>}
          <div>
            <p className="member-meta">封面照片（選填，JPG／PNG／WebP，最多 5 MB）</p>
            {coverPhoto && <img src={coverPhoto.webPath} alt="尚未儲存的活動封面預覽" className="event-card-poster" onError={() => {
              if (active() && !submitLock.current.isBusy()) { setCoverPhoto(null); setError("無法顯示封面照片，請重新選擇；尚未發布活動。"); }
            }} />}
            <button type="button" className="secondary" onClick={() => void handlePickCoverPhoto()}>{capturingPhoto ? "讀取照片中…" : coverPhoto ? "重新拍攝封面照片" : "拍攝封面照片"}</button>
            {coverPhoto && <button type="button" className="secondary" onClick={() => setCoverPhoto(null)}>移除尚未發布的封面</button>}
          </div>
          <button type="submit" className="primary">{submitting ? "發布中…" : "發布活動"}</button>
        </fieldset>
        <button type="button" className="secondary" onClick={() => close()}>取消</button>
      </form>}
    </div>
  );
}

function MemberEventsScreen({ member }: { member: Member }) {
  const [events, setEvents] = useState<EventCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [readConfirmed, setReadConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const root = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const loadGeneration = useRef(0);
  const lifecycle = useRef(0);
  const mutationLock = useRef(false);
  const ownerSession = useRef(api.captureSessionGuard());
  const active = useCallback(() => mounted.current && ownerSession.current(), []);

  const load = useCallback(async () => {
    if (!active()) return false;
    const attempt = ++loadGeneration.current, life = lifecycle.current, sessionCurrent = api.captureSessionGuard();
    const current = () => active() && lifecycle.current === life && loadGeneration.current === attempt && sessionCurrent();
    setLoading(true); setReadConfirmed(false); setError(null);
    try {
      const data = await api.getEvents();
      if (!current()) return false;
      setEvents(readEventCards(data)); setReadConfirmed(true); return true;
    } catch (failure) {
      if (current()) setError(safeMessage(failure, "讀取活動失敗，不能視為沒有活動；請重新載入。"));
      return false;
    } finally { if (current()) setLoading(false); }
  }, [active]);

  useEffect(() => {
    mounted.current = true; void load();
    return () => { mounted.current = false; lifecycle.current++; loadGeneration.current++; };
  }, [load]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  useEffect(() => { root.current?.closest<HTMLElement>(".shell-content")?.scrollTo(0, 0); }, [creating, openEventId]);

  async function handleToggle(eventId: string) {
    if (!active() || mutationLock.current || loading || !readConfirmed) return;
    mutationLock.current = true; loadGeneration.current++;
    const life = lifecycle.current, sessionCurrent = api.captureSessionGuard();
    const current = () => active() && lifecycle.current === life && sessionCurrent();
    setBusyId(eventId); setError(null); setToast(null);
    try {
      const result = await api.toggleEventRegistration(eventId);
      if (!current()) return;
      if (!result || typeof result.registered !== "boolean") throw new EventDraftError("報名結果尚未確認，請先重新讀取活動，不要直接重複操作。");
      setToast(result.registered ? "已完成報名" : "已取消報名");
      await load();
    } catch (failure) {
      if (!current()) return;
      const rejected = failure instanceof ApiError && typeof failure.status === "number" && failure.status >= 400 && failure.status < 500;
      if (!rejected) setReadConfirmed(false);
      setError(rejected ? safeMessage(failure, "尚未完成報名操作") : "報名結果尚未確認，請重新讀取活動核對；不會自動重送操作。");
    } finally { mutationLock.current = false; if (current()) setBusyId(null); }
  }

  const back = () => { setOpenEventId(null); void load(); };
  if (openEventId) return <div ref={root}><EventDetailScreen key={member.id + ":" + openEventId} eventId={openEventId} onBack={back} /></div>;
  if (creating) return <div className="events-screen" ref={root}><CreateEventForm key={member.id} memberId={member.id} onClose={uncertain => {
    if (uncertain) setToast("上一筆發布結果尚未確認。請重新讀取活動並核對，不會自動重送。");
    setCreating(false); void load();
  }} onCreated={() => setToast("活動已發布")} /></div>;

  const { upcoming, past } = partitionEvents(events, now);
  function renderCard(event: EventCard, index: number) {
    return <div key={event.id} className="event-card">
      <button type="button" disabled={busyId !== null} onClick={() => setOpenEventId(event.id)} style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}>
        <p className="list-card-title">{event.title}</p>
        <p className="list-card-meta">{formatDate(event.startAt)}（台灣時間） · {event.location}</p>
        <p className="list-card-meta">{event.hostChapter} · 已報名 {event.registeredCount}{event.capacity ? "／" + event.capacity : ""}</p>
      </button>
      {event.coverPhotoUrl ? <img src={event.coverPhotoUrl} alt="" className="event-card-poster" /> : <div className={"event-card-poster-fallback " + EVENT_GRADIENTS[index % EVENT_GRADIENTS.length]} />}
      <button type="button" className={event.isRegistered ? "secondary" : "primary"} disabled={busyId !== null || !readConfirmed || (!event.isRegistered && event.isFull)} onClick={() => void handleToggle(event.id)}>
        {busyId === event.id ? "處理中…" : event.isRegistered ? "取消報名" : event.isFull ? "名額已滿" : "報名參加"}
      </button>
    </div>;
  }

  return <div className="events-screen" ref={root}>
    <div className="screen-header">
      <h1 className="screen-title">活動</h1>
      <button type="button" className="my-screen-edit-button" disabled={loading || !readConfirmed || busyId !== null} onClick={() => setCreating(true)}>＋ 發布活動</button>
    </div>
    {toast && <div className="toast" role="status">{toast}</div>}
    {error && <p className="error" role="alert">{error}</p>}
    {loading && <p className="member-meta" role="status">讀取活動中…</p>}
    <button type="button" className="secondary" disabled={busyId !== null} onClick={() => void load()}>{loading ? "重新讀取活動" : "重新載入活動"}</button>
    {!loading && readConfirmed && <>
      <section>
        <h2 className="section-title">即將舉辦（{upcoming.length}）</h2>
        {upcoming.length === 0 && <p className="member-meta">目前沒有即將舉辦的活動。</p>}
        <div className="list-stack">{upcoming.map(renderCard)}</div>
      </section>
      {past.length > 0 && <section><h2 className="section-title">已開始／過往活動（{past.length}）</h2><div className="list-stack">{past.map(renderCard)}</div></section>}
    </>}
  </div>;
}

export default function EventsScreen({ member }: { member: Member }) {
  // A new actor gets a fresh list, composer and operation lifecycle.
  return <MemberEventsScreen key={member.id} member={member} />;
}
