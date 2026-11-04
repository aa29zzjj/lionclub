import { useCallback, useEffect, useState } from "react";
import { Camera } from "@capacitor/camera";
import jsQR from "jsqr";
import { createApiClient, ApiError, type EventDetail, type Registration } from "./contract";
import Avatar from "./Avatar";
import { colorFromId } from "../../src/lib/avatar-color";
import { EVENT_TIME_ZONE } from "../../src/lib/event-calendar";
import { CalendarIcon, PinIcon } from "../../src/components/icons";

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

/** Same single-shot "take a photo, decode it" approach as FriendsScreen's QR
 * add-friend flow (no live camera preview plugin is installed — see that
 * file's comment). Reused here for event check-in. */
async function decodeQrFromCamera(): Promise<string | null> {
  const photo = await Camera.takePhoto({ quality: 80 });
  if (!photo.webPath) return null;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
    img.src = photo.webPath!;
  });
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  return code?.data ?? null;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("zh-TW", {
    timeZone: EVENT_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function EventDetailScreen({ eventId, onBack }: { eventId: string; onBack: () => void }) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [registrationsLoading, setRegistrationsLoading] = useState(false);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [registeredCount, setRegisteredCount] = useState(0);
  const [search, setSearch] = useState("");

  const [checkInBusy, setCheckInBusy] = useState(false);
  const [checkInToast, setCheckInToast] = useState<string | null>(null);
  const [manualMember, setManualMember] = useState<Registration["member"] | null>(null);
  const [manualReason, setManualReason] = useState("");
  const [manualConfirmed, setManualConfirmed] = useState(false);

  const [showReportForm, setShowReportForm] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportBusy, setReportBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEvent(await api.getEvent(eventId));
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "活動資料無法載入");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  const loadRegistrations = useCallback(async () => {
    if (!event?.canManage) return;
    setRegistrationsLoading(true);
    try {
      const data = await api.getEventRegistrations(eventId);
      setRegistrations(data.registrations);
      setCheckedInCount(data.checkedInCount);
      setRegisteredCount(data.registeredCount);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "無法讀取報名名單");
    } finally {
      setRegistrationsLoading(false);
    }
  }, [eventId, event?.canManage]);

  useEffect(() => { void loadRegistrations(); }, [loadRegistrations]);

  async function toggleRegister() {
    if (!event) return;
    setToggling(true);
    setError(null);
    try {
      await api.toggleEventRegistration(eventId);
      await load();
      setToast("已更新報名狀態");
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "操作失敗，請再試一次");
    } finally {
      setToggling(false);
    }
  }

  async function submitCheckIn(payload: { qrValue: string } | { memberId: string; method: "manual"; reason: string }) {
    setCheckInBusy(true);
    setCheckInToast(null);
    try {
      await api.checkInToEvent(eventId, payload);
      setCheckInToast("報到成功");
      if ("memberId" in payload) {
        setManualMember(null);
        setManualReason("");
        setManualConfirmed(false);
      }
      await loadRegistrations();
    } catch (failure) {
      setCheckInToast(failure instanceof ApiError ? failure.message : "報到失敗，請再試一次");
    } finally {
      setCheckInBusy(false);
    }
  }

  async function handleScanCheckIn() {
    setCheckInBusy(true);
    setCheckInToast(null);
    try {
      const raw = await decodeQrFromCamera();
      if (!raw) {
        setCheckInToast("無法辨識此 QR Code，請對準後重新拍攝");
        return;
      }
      await submitCheckIn({ qrValue: raw });
    } catch {
      setCheckInToast("拍攝失敗，請再試一次");
    } finally {
      setCheckInBusy(false);
    }
  }

  async function submitReport() {
    if (reportReason.trim().length < 2) return;
    setReportBusy(true);
    setError(null);
    try {
      await api.reportEvent(eventId, reportReason.trim());
      setShowReportForm(false);
      setReportReason("");
      setToast("已送出檢舉，感謝您的回報");
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "檢舉送出失敗");
    } finally {
      setReportBusy(false);
    }
  }

  if (loading) {
    return (
      <div>
        <button type="button" className="profile-back" onClick={onBack}>‹ 返回</button>
        <p className="member-meta">載入中…</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div>
        <button type="button" className="profile-back" onClick={onBack}>‹ 返回</button>
        <p className="error" role="alert">{error || "找不到這個活動，可能已被移除。"}</p>
      </div>
    );
  }

  const term = search.trim().toLocaleLowerCase();
  const visibleRegistrations = registrations.filter(({ member }) =>
    !term || [member.name, member.nickname, member.email, member.phone, member.organization.name].some((v) => v?.toLocaleLowerCase().includes(term)));

  return (
    <div className="events-screen">
      <button type="button" className="profile-back" onClick={onBack}>‹ 返回</button>

      {event.coverPhotoUrl ? (
        <img src={event.coverPhotoUrl} alt="" className="event-card-poster" style={{ marginTop: 0 }} />
      ) : (
        <div className="event-card-poster-fallback g0" style={{ marginTop: 0 }} />
      )}

      <h1 className="screen-title" style={{ marginTop: "0.75rem" }}>{event.title}</h1>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Avatar name={event.hostChapter} color="#3D5A99" size={28} />
        <p className="member-meta">{event.hostChapter} 主辦</p>
      </div>

      {toast ? <div className="toast" role="status">{toast}</div> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}

      <div className="event-card">
        <p className="list-card-meta" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><CalendarIcon className="icon-14" /> {formatDateTime(event.startAt)}（台灣時間）</p>
        <p className="list-card-meta" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><PinIcon className="icon-14" /> {event.location}</p>
        {event.capacity ? (
          <p className="list-card-meta">已報名 {event.registeredCount}／{event.capacity}{event.isFull ? " · 名額已滿" : ""}</p>
        ) : null}
      </div>

      {event.description ? (
        <section className="my-screen-section">
          <h2 className="section-title">活動說明</h2>
          <p className="profile-bio">{event.description}</p>
        </section>
      ) : null}

      <button
        type="button"
        className={event.isRegistered ? "secondary" : "primary"}
        disabled={event.isCheckedIn || toggling || (!event.isRegistered && event.isFull)}
        onClick={toggleRegister}
        style={{ marginTop: "1rem" }}
      >
        {toggling ? "更新報名狀態中…" : event.isCheckedIn ? "已報到，無法自行取消" : event.isRegistered ? "已報名（點擊取消）" : event.isFull ? "名額已滿" : "我要報名"}
      </button>

      {event.canManage ? (
        <section className="my-screen-section">
          <h2 className="section-title">活動報名名單</h2>
          <p className="member-meta">已到 {checkedInCount}／應到 {registeredCount} 人</p>

          <button type="button" className="primary" disabled={checkInBusy} onClick={handleScanCheckIn} style={{ marginTop: "0.5rem" }}>
            {checkInBusy ? "處理中…" : "拍攝會員 QR Code 報到"}
          </button>
          {checkInToast ? <p className="member-meta" role="status" style={{ marginTop: "0.4rem" }}>{checkInToast}</p> : null}

          <div style={{ marginTop: "0.75rem" }}>
            <label htmlFor="reg-search">搜尋報名會員</label>
            <input id="reg-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="找不到 QR 時，可搜尋後人工補登" />
          </div>
          <button type="button" className="secondary" disabled={registrationsLoading} onClick={() => void loadRegistrations()} style={{ marginTop: "0.5rem" }}>
            重新載入名單
          </button>

          {registrationsLoading ? <p className="member-meta" style={{ marginTop: "0.5rem" }}>讀取名單中…</p> : null}
          {!registrationsLoading && registrations.length === 0 ? <p className="member-meta" style={{ marginTop: "0.5rem" }}>目前還沒有人報名</p> : null}

          <div className="list-stack" style={{ marginTop: "0.75rem" }}>
            {visibleRegistrations.map((reg) => (
              <div key={reg.id} className="list-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div className="list-card-main" style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
                  <Avatar name={reg.member.name} color={colorFromId(reg.member.id)} imageUrl={reg.member.photoUrl} size={40} />
                  <div>
                    <p className="list-card-title">{reg.member.nickname || reg.member.name}</p>
                    <p className="list-card-meta">{reg.member.organization.name}{reg.member.title ? ` · ${reg.member.title}` : ""}</p>
                    <p className="list-card-meta">{reg.checkedInAt ? "✓ 已報到" : "未報到"}</p>
                  </div>
                </div>
                {!reg.checkedInAt ? (
                  manualMember?.id === reg.member.id ? (
                    <div className="compose-form" style={{ marginTop: "0.6rem" }}>
                      <label htmlFor={`manual-reason-${reg.id}`}>補登原因（2–1000 字）</label>
                      <textarea id={`manual-reason-${reg.id}`} rows={2} value={manualReason} onChange={(e) => { setManualReason(e.target.value); setManualConfirmed(false); }} placeholder="例如：已核對本人，會員手機無法顯示 QR" />
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <input type="checkbox" checked={manualConfirmed} onChange={(e) => setManualConfirmed(e.target.checked)} />
                        <span>我已核對 {reg.member.name} 本人及報名資料</span>
                      </label>
                      <div className="form-actions">
                        <button type="button" className="secondary" onClick={() => setManualMember(null)} disabled={checkInBusy}>取消</button>
                        <button type="button" className="primary" disabled={checkInBusy || !manualConfirmed || manualReason.trim().length < 2} onClick={() => submitCheckIn({ memberId: reg.member.id, method: "manual", reason: manualReason.trim() })}>
                          {checkInBusy ? "補登中…" : "確認補登"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="secondary" style={{ marginTop: "0.6rem" }} onClick={() => { setManualMember(reg.member); setManualReason(""); setManualConfirmed(false); }}>
                      人工補登
                    </button>
                  )
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="my-screen-section">
          <button type="button" className="secondary" onClick={() => setShowReportForm((v) => !v)}>檢舉此活動</button>
          {showReportForm ? (
            <div className="compose-form" style={{ marginTop: "0.6rem" }}>
              <label htmlFor="event-report-reason">檢舉原因</label>
              <textarea id="event-report-reason" rows={3} maxLength={200} value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="請簡述檢舉原因" />
              <div className="form-actions">
                <button type="button" className="secondary" disabled={reportBusy} onClick={() => setShowReportForm(false)}>取消</button>
                <button type="button" className="primary" disabled={reportBusy || reportReason.trim().length < 2} onClick={submitReport}>送出檢舉</button>
              </div>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
