"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import FriendQrScanner from "@/components/FriendQrScanner";
import AccessibleDialog from "@/components/AccessibleDialog";
import { PinIcon } from "@/components/icons";
import { colorFromId } from "@/lib/avatar-color";
import { EVENT_TIME_ZONE, taipeiEventStartAt } from "@/lib/event-calendar";
import { EVENT_CATEGORIES, eventCategoryLabels, type EventCategory } from "@/lib/event-category";
import { eventScopeLabels, type EventScope } from "@/lib/event-scope";

type EventDetail = {
  id: string;
  title: string;
  description?: string;
  location: string;
  capacity?: number;
  category: EventCategory;
  scope: EventScope;
  coverPhotoUrl?: string;
  hostChapter: string;
  startAt: string;
  isRegistered: boolean;
  isCheckedIn?: boolean;
  registeredCount: number;
  isFull: boolean;
  canManage: boolean;
};

type Registration = {
  id: string;
  registeredAt: string;
  checkedInAt: string | null;
  member: {
    id: string;
    name: string;
    nickname: string | null;
    email: string | null;
    phone: string | null;
    title: string | null;
    photoUrl: string | null;
    organization: { name: string };
  };
};

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const mutationBusyRef = useRef(false);
  const togglingRef = useRef(false);
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<EventCategory>("CLUB_OFFICIAL");
  const [scope, setScope] = useState<EventScope>("CLUB");
  const [allowedScopes, setAllowedScopes] = useState<EventScope[]>(["CLUB"]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [registrationsLoading, setRegistrationsLoading] = useState(false);
  const [registrationsError, setRegistrationsError] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [checkInToast, setCheckInToast] = useState("");
  const [checkInState, setCheckInState] = useState<"success" | "error" | null>(null);
  const [checkInBusy, setCheckInBusy] = useState(false);
  const checkInBusyRef = useRef(false);
  const [scanKey, setScanKey] = useState(0);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [registeredCount, setRegisteredCount] = useState(0);
  const [registrationSearch, setRegistrationSearch] = useState("");
  const [manualMember, setManualMember] = useState<Registration["member"] | null>(null);
  const [manualReason, setManualReason] = useState("");
  const [manualConfirmed, setManualConfirmed] = useState(false);
  const [lastQr, setLastQr] = useState("");

  const loadRegistrations = useCallback(async () => {
    setRegistrationsLoading(true); setRegistrationsError("");
    try {
      const response = await fetch(`/api/events/${params.id}/registrations`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { router.replace("/login"); return; }
      if (!response.ok) throw new Error(result.error ?? "無法讀取報名名單");
      setRegistrations(result.registrations ?? []);
      setCheckedInCount(result.checkedInCount ?? (result.registrations ?? []).filter((entry: Registration) => entry.checkedInAt).length);
      setRegisteredCount(result.registeredCount ?? result.registrations?.length ?? 0);
    } catch (loadError) { setRegistrationsError(loadError instanceof Error && !(loadError instanceof TypeError) ? loadError.message : "名單連線中斷，請重試"); }
    finally { setRegistrationsLoading(false); }
  }, [params.id, router]);

  async function submitCheckIn(payload: { qrValue: string } | { memberId: string; method: "manual"; reason: string }) {
    if (!event || checkInBusyRef.current || mutationBusyRef.current || togglingRef.current) return;
    checkInBusyRef.current = true; setCheckInBusy(true); setCheckInToast(""); setCheckInState(null);
    try {
      const res = await fetch(`/api/events/${event.id}/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { router.replace("/login"); return; }
      if (!res.ok) throw new Error(data.error ?? "報到失敗，請核對後重試");
      const displayName = data.member?.nickname || data.member?.name || "會員";
      setCheckInToast(data.alreadyCheckedIn ? `${displayName} 先前已報到，無需重複登記` : `${displayName} 報到成功`);
      setCheckInState("success");
      if (typeof data.checkedInCount === "number") setCheckedInCount(data.checkedInCount);
      if (typeof data.registeredCount === "number") setRegisteredCount(data.registeredCount);
      setRegistrations((prev) =>
        prev.map((r) => (r.member.id === data.member?.id ? { ...r, checkedInAt: data.checkedInAt } : r))
      );
      if ("memberId" in payload) { setManualMember(null); setManualReason(""); setManualConfirmed(false); }
      await loadRegistrations();
    } catch (failure) {
      setCheckInState("error");
      setCheckInToast(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : "連線中斷，報到結果尚未確認。請重試同一張 QR 或重新載入名單；重複掃描不會重複簽到。");
    } finally { checkInBusyRef.current = false; setCheckInBusy(false); }
  }

  async function handleCheckInScan(decodedText: string) {
    setLastQr(decodedText);
    await submitCheckIn({ qrValue: decodedText });
  }

  function loadForm(nextEvent: EventDetail) {
    const date = new Date(nextEvent.startAt);
    const local = new Date(date.getTime() + 8 * 60 * 60_000).toISOString().slice(0, 16);
    setTitle(nextEvent.title);
    setStartAt(local);
    setLocation(nextEvent.location);
    setCapacity(nextEvent.capacity ? String(nextEvent.capacity) : "");
    setDescription(nextEvent.description ?? "");
    setCategory(nextEvent.category);
    setScope(nextEvent.scope);
    setCoverFile(null);
    setCoverPreview(nextEvent.coverPhotoUrl ?? null);
  }

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("請選擇 5 MB 內的 JPG、PNG 或 WebP 圖片");
      return;
    }
    if (coverPreview?.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setNotFound(false); setError(""); setEvent(null);
    void (async () => {
      try {
        const res = await fetch(`/api/events/${params.id}`, { cache: "no-store", signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (res.status === 401) {
          setError("登入已過期，正在前往登入頁。");
          router.replace("/login?reason=session-expired");
          return;
        }
        if (res.status === 404) {
          setNotFound(true);
          setError(data.error ?? "找不到這個活動，可能已被移除。");
          return;
        }
        if (!res.ok) throw new Error(data.error ?? "活動資料無法載入，請稍後重試。");
        if (!data.event || typeof data.event.id !== "string" || typeof data.event.startAt !== "string" || !Number.isFinite(new Date(data.event.startAt).getTime())) {
          throw new Error("活動資料格式異常，請返回列表後重試。");
        }
        setEvent(data.event);
        loadForm(data.event);
        if (Array.isArray(data.allowedScopes)) setAllowedScopes(data.allowedScopes);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : "活動資料無法載入，請確認網路後重新整理。");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [params.id, router]);

  useEffect(() => {
    if (!event?.canManage) return;
    void loadRegistrations();
  }, [event?.canManage, event?.registeredCount, loadRegistrations]);

  async function toggleRegister() {
    if (!event || toggling || togglingRef.current || mutationBusyRef.current || checkInBusyRef.current) return;
    togglingRef.current = true;
    setToggling(true);
    setError("");
    try {
    const res = await fetch(`/api/events/${event.id}/register`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      setError("登入已過期，請重新登入後再操作。");
      router.replace("/login?reason=session-expired");
      return;
    }
    if (res.ok && typeof data.registered === "boolean") {
      setEvent((prev) => prev ? {
        ...prev,
        isRegistered: data.registered,
        registeredCount: prev.registeredCount + (data.registered ? 1 : -1),
        isFull: Boolean(prev.capacity && prev.registeredCount + (data.registered ? 1 : -1) >= prev.capacity),
      } : prev);
    } else {
      setError(data.error ?? "報名狀態更新失敗");
    }
    } catch { setError("連線中斷，請重新載入確認報名狀態後再試"); }
    finally { togglingRef.current = false; setToggling(false); }
  }

  async function saveEvent(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!event || saving || deleting || mutationBusyRef.current || togglingRef.current || checkInBusyRef.current) return;
    const [date, time] = startAt.split("T");
    const nextStartAt = taipeiEventStartAt(date, time);
    if (!title.trim() || !location.trim() || !nextStartAt) {
      setError("請確認活動名稱、地點與日期時間（台灣時間）。");
      return;
    }
    if (capacity && (!Number.isInteger(Number(capacity)) || Number(capacity) < Math.max(event.registeredCount, 1))) {
      setError(`名額請填寫至少 ${Math.max(event.registeredCount, 1)} 的整數，或留空不限制。`);
      return;
    }
    mutationBusyRef.current = true;
    setSaving(true);
    setError("");

    let updateStarted = false;
    try {
    let coverPhotoUrl = event.coverPhotoUrl ?? null;
    if (coverFile) {
      const signResponse = await fetch("/api/events/cover-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: coverFile.type, size: coverFile.size }),
      });
      const signResult = await signResponse.json().catch(() => ({}));
      if (signResponse.status === 401) {
        setError("登入已過期，請重新登入後再儲存。");
        router.replace("/login?reason=session-expired");
        return;
      }
      if (!signResponse.ok) {
        setError(signResult.error ?? "無法準備封面照片上傳");
        return;
      }
      const uploadResponse = await fetch(signResult.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": coverFile.type },
        body: coverFile,
      });
      if (!uploadResponse.ok) {
        setError("封面照片上傳失敗，請稍後再試");
        return;
      }
      coverPhotoUrl = signResult.coverPhotoUrl;
    }

    updateStarted = true;
    const response = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        startAt: nextStartAt,
        location: location.trim(),
        capacity: capacity ? Number(capacity) : null,
        description: description.trim() || null,
        coverPhotoUrl,
        category,
        scope: category === "CLUB_OFFICIAL" ? scope : undefined,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      setError("登入已過期，請重新登入後再儲存。");
      router.replace("/login?reason=session-expired");
      return;
    }
    if (!response.ok) {
      setError(result.error ?? "活動更新失敗");
      return;
    }
    setEvent((current) => current ? {
      ...current,
      title: title.trim(),
      startAt: nextStartAt,
      location: location.trim(),
      capacity: capacity ? Number(capacity) : undefined,
      description: description.trim() || undefined,
      coverPhotoUrl: coverPhotoUrl ?? undefined,
      category,
      scope: category === "CLUB_OFFICIAL" ? scope : "CLUB",
      isFull: Boolean(capacity && current.registeredCount >= Number(capacity)),
    } : current);
    setEditing(false);
    setCoverFile(null);
    setCoverPreview(coverPhotoUrl);
    } catch {
      setError(updateStarted
        ? "儲存時連線中斷，結果尚未確認。請重新載入活動確認後再試，避免重複操作。"
        : "封面上傳時連線中斷，尚未儲存活動，請確認網路後重試。");
    } finally {
      mutationBusyRef.current = false;
      setSaving(false);
    }
  }

  async function deleteEvent() {
    if (!event || saving || deleting || mutationBusyRef.current || togglingRef.current || checkInBusyRef.current) return;
    if (!window.confirm(`確定刪除「${event.title}」嗎？相關報名與通知也會移除；已有簽到紀錄的活動不可刪除。`)) return;
    mutationBusyRef.current = true; setDeleting(true); setError("");
    try {
      const response = await fetch(`/api/events/${event.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setError("登入已過期，請重新登入後再操作。");
        router.replace("/login?reason=session-expired");
        return;
      }
      if (!response.ok) {
        setError(result.error ?? "活動刪除失敗");
        return;
      }
      router.replace("/events");
      router.refresh();
    } catch {
      setError("刪除時連線中斷，結果尚未確認。請先返回列表確認活動是否仍存在，再決定是否重試。");
    } finally {
      mutationBusyRef.current = false;
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <AppShell showNav={false}>
        <div className="px-5 pt-6 pb-8">
          <p className="text-sm text-lion-muted text-center py-16">載入中...</p>
        </div>
      </AppShell>
    );
  }

  if (notFound || !event) {
    return (
      <AppShell showNav={false}>
        <div className="px-5 pt-6 flex flex-col items-center text-center gap-3 py-16">
          <p role="alert" className="text-base text-lion-danger">{error || "找不到這個活動，可能已被移除。"}</p>
          <Link href="/events" className="touch-link text-lion-gold text-base">
            返回活動列表
          </Link>
        </div>
      </AppShell>
    );
  }

  const dateLabel = new Date(event.startAt).toLocaleString("zh-TW", {
    timeZone: EVENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const searchTerm = registrationSearch.trim().toLocaleLowerCase();
  const visibleRegistrations = registrations.filter(({ member }) => !searchTerm || [member.name, member.nickname, member.email, member.phone, member.organization.name].some((value) => value?.toLocaleLowerCase().includes(searchTerm)));
  const checkInFeedback = (checkInBusy || checkInToast) && <div className="my-3 rounded-xl border border-lion-border bg-lion-soft p-4">
    <p role={checkInState === "error" ? "alert" : "status"} className={`text-base font-semibold leading-relaxed ${checkInState === "error" ? "text-lion-danger" : "text-lion-cream"}`}>{checkInBusy ? "正在核對報名及報到，請稍候…" : `${checkInState === "error" ? "未完成：" : "✓ "}${checkInToast}`}</p>
    {!checkInBusy && scanning && <div className="mt-3 grid gap-2">
      {checkInState === "error" && lastQr && <button type="button" onClick={() => void handleCheckInScan(lastQr)} className="min-h-12 rounded-xl border border-lion-border px-3 text-base">重試同一張 QR</button>}
      <button type="button" onClick={() => { setCheckInToast(""); setCheckInState(null); setLastQr(""); setScanKey((value) => value + 1); }} className="min-h-12 rounded-xl bg-lion-action px-3 text-base font-semibold text-lion-navyDeep">下一位，繼續掃描</button>
    </div>}
  </div>;

  return (
    <AppShell showNav={false}>
      <div className="px-5 pt-6 pb-8">
        <button onClick={() => router.back()} disabled={saving || deleting} className="min-h-12 text-base text-lion-muted mb-4 disabled:opacity-50">
          ← 返回
        </button>

        {event.coverPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.coverPhotoUrl} alt="" className="h-36 w-full rounded-2xl object-cover mb-4" />
        ) : (
          <div className="h-36 rounded-2xl bg-gradient-to-br from-lion-navyLight to-[#2E4A8A] mb-4" />
        )}

        <div className="flex gap-2 mb-2">
          <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${event.category === "PERSONAL" ? "bg-white/10 text-lion-muted" : "bg-lion-gold/15 text-lion-gold"}`}>
            {eventCategoryLabels[event.category]}
          </span>
          {event.scope !== "CLUB" && (
            <span className="inline-block rounded-full bg-white/10 px-2.5 py-1 text-xs text-lion-muted">{eventScopeLabels[event.scope]}</span>
          )}
        </div>
        <div className="flex items-start justify-between gap-3 mb-2">
          <h1 className="text-xl font-bold">{event.title}</h1>
          {event.canManage && !editing && (
            <button onClick={() => setEditing(true)} disabled={toggling || checkInBusy} className="min-h-12 shrink-0 text-base text-lion-gold disabled:opacity-50">編輯活動</button>
          )}
        </div>
        <div className="flex items-center gap-2 mb-4">
          <Avatar name={event.hostChapter} color="#3D5A99" size={28} />
          <p className="text-sm text-lion-muted">{event.hostChapter} 主辦</p>
        </div>

        {editing ? (
          <form onSubmit={saveEvent} aria-busy={saving || deleting} className="rounded-2xl bg-lion-card border border-lion-gold/20 p-4 flex flex-col gap-3 mb-4">
            <fieldset disabled={saving || deleting || toggling || checkInBusy} className="flex min-w-0 flex-col gap-3 disabled:opacity-70">
            <legend className="sr-only">編輯活動資料</legend>
            <p className="text-base text-lion-muted">活動日期與時間皆以台灣時間編輯與顯示。</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="選擇活動封面照片（選填）"
              className="w-full h-28 rounded-xl bg-white/[0.04] border-2 border-dashed border-lion-gold/40 flex items-center justify-center overflow-hidden"
            >
              {coverPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-lion-muted">點擊選擇封面照片</span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleCoverChange}
            />
            <label htmlFor="edit-event-title" className="text-base">活動名稱（必填）</label>
            <input id="edit-event-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} className="min-h-12 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 text-base" placeholder="活動名稱" />
            <label htmlFor="edit-event-start-at" className="text-base">日期與時間（台灣時間，必填）</label>
            <input id="edit-event-start-at" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required className="min-h-12 min-w-0 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 text-base" />
            <label htmlFor="edit-event-location" className="text-base">地點（必填）</label>
            <input id="edit-event-location" value={location} onChange={(e) => setLocation(e.target.value)} required maxLength={240} className="min-h-12 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 text-base" placeholder="地點" />
            <label htmlFor="edit-event-capacity" className="text-base">名額（選填，留白為不限）</label>
            <input id="edit-event-capacity" type="number" min={event.registeredCount || 1} step={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className="min-h-12 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 text-base" placeholder="名額（留白為不限）" />
            <label htmlFor="edit-event-description" className="text-base">活動說明（選填）</label>
            <textarea id="edit-event-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} rows={3} className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 text-base resize-none" placeholder="活動說明" />
            <div>
              <span className="text-base block mb-1">活動類型</span>
              <div className="flex gap-2">
                {EVENT_CATEGORIES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCategory(value)}
                    aria-pressed={category === value}
                    className={`min-h-12 rounded-xl border px-3 text-sm font-medium ${category === value ? "border-lion-gold bg-lion-gold/10 text-lion-gold" : "border-lion-border text-lion-muted"}`}
                  >
                    {eventCategoryLabels[value]}
                  </button>
                ))}
              </div>
            </div>
            {category === "CLUB_OFFICIAL" && allowedScopes.length > 1 && (
              <div>
                <span className="text-base block mb-1">發佈範圍</span>
                <div className="flex gap-2">
                  {allowedScopes.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setScope(value)}
                      aria-pressed={scope === value}
                      className={`min-h-12 rounded-xl border px-3 text-sm font-medium ${scope === value ? "border-lion-gold bg-lion-gold/10 text-lion-gold" : "border-lion-border text-lion-muted"}`}
                    >
                      {eventScopeLabels[value]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" disabled={saving || deleting} onClick={() => { loadForm(event); setEditing(false); setError(""); }} className="min-h-12 flex-1 rounded-xl bg-white/10 py-2 text-base disabled:opacity-50">取消</button>
              <button type="submit" disabled={saving || deleting} className="min-h-12 flex-1 rounded-xl bg-lion-action text-lion-navyDeep py-2 text-base font-semibold disabled:opacity-50">{saving ? "儲存中…" : "儲存"}</button>
            </div>
            <button type="button" onClick={deleteEvent} disabled={saving || deleting} className="min-h-12 text-base text-lion-danger py-1 disabled:opacity-50">{deleting ? "刪除中，請稍候…" : "刪除活動"}</button>
            </fieldset>
          </form>
        ) : <div className="rounded-2xl bg-lion-card border border-white/[0.06] p-4 flex flex-col gap-3 mb-4">
          <div className="flex items-start gap-2.5 text-sm">
            <span className="text-lion-gold">🗓</span>
            <span>{dateLabel}（台灣時間）</span>
          </div>
          <div className="flex items-start gap-2.5 text-sm">
            <PinIcon className="w-4 h-4 text-lion-gold mt-0.5" />
            <span>{event.location}</span>
          </div>
          {event.capacity && (
            <div className="flex items-start gap-2.5 text-sm">
              <span className="text-lion-gold">👥</span>
              <span>已報名 {event.registeredCount}／{event.capacity} 人{event.isFull ? " · 名額已滿" : ""}</span>
            </div>
          )}
        </div>}

        {error && <p role="alert" className="mb-4 text-base text-lion-danger">{error}</p>}

        {event.description && (
          <div className="mb-6">
            <h2 className="font-semibold mb-2">活動說明</h2>
            <p className="text-sm text-lion-cream/70 leading-relaxed">{event.description}</p>
          </div>
        )}

        {event.canManage && (
          <section className="mb-6 rounded-2xl border border-white/[0.06] bg-lion-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] tracking-[0.16em] text-lion-gold">REGISTRATIONS</p>
                <h2 className="mt-1 font-semibold">活動報名名單</h2>
              </div>
              <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-lion-muted">
                已到 {checkedInCount}／應到 {registeredCount} 人
              </span>
            </div>

            <button
              type="button"
              onClick={() => { setCheckInToast(""); setCheckInState(null); setScanKey(0); setScanning(true); }}
              disabled={checkInBusy || saving || deleting || toggling}
              className="mt-3 min-h-12 w-full rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-2.5 text-base disabled:opacity-50"
            >
              掃會員證報到
            </button>
            {!scanning && checkInFeedback}
            <div className="mt-3"><label htmlFor="registration-search" className="mb-1 block text-sm text-lion-muted">搜尋報名會員（姓名／暱稱／電話／Email）</label><input id="registration-search" type="search" value={registrationSearch} onChange={(change) => setRegistrationSearch(change.target.value)} className="min-h-12 w-full rounded-xl border border-lion-border bg-lion-page px-3 text-base" placeholder="找不到 QR 時，可搜尋後人工補登" /></div>
            <button type="button" disabled={registrationsLoading || checkInBusy} onClick={() => void loadRegistrations()} className="mt-2 min-h-12 rounded-xl border border-lion-border px-3 text-sm disabled:opacity-50">重新載入名單與報到數</button>

            {registrationsLoading ? (
              <p className="py-8 text-center text-sm text-lion-muted">讀取名單中…</p>
            ) : registrationsError ? (
              <p className="mt-4 text-sm text-red-300">{registrationsError}</p>
            ) : registrations.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-7 text-center text-sm text-lion-muted">
                目前還沒有人報名
              </div>
            ) : (
              <div className="mt-4 flex flex-col divide-y divide-white/[0.06]">
                {visibleRegistrations.length === 0 && <p className="py-5 text-base text-lion-muted">找不到符合搜尋條件的報名會員</p>}
                {visibleRegistrations.map((registration) => {
                  const { member } = registration;
                  return (
                    <div key={registration.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                      <Avatar name={member.name} color={colorFromId(member.id)} imageUrl={member.photoUrl} size={42} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="break-words text-base font-medium">{member.nickname || member.name}</p>
                            {member.nickname && <p className="text-sm text-lion-muted">本名：{member.name}</p>}
                            <p className="break-words text-sm text-lion-muted">{member.organization.name}{member.title ? ` · ${member.title}` : ""}</p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="text-[10px] text-lion-muted">
                              {new Date(registration.registeredAt).toLocaleDateString("zh-TW", { timeZone: EVENT_TIME_ZONE })}
                            </span>
                            {registration.checkedInAt ? (
                              <span className="rounded-full bg-lion-soft px-2 py-1 text-sm font-medium">✓ 已報到</span>
                            ) : (
                              <span className="rounded-full bg-lion-soft px-2 py-1 text-sm text-lion-muted">未報到</span>
                            )}
                          </div>
                        </div>
                        {!registration.checkedInAt && <button type="button" disabled={checkInBusy || saving || deleting || toggling} onClick={() => { setCheckInToast(""); setCheckInState(null); setManualReason(""); setManualConfirmed(false); setManualMember(member); }} className="mt-2 min-h-12 rounded-xl border border-lion-border px-3 text-sm font-medium disabled:opacity-50">人工補登 {member.nickname || member.name}</button>}
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {member.phone && <a href={`tel:${member.phone}`} className="text-lion-gold">{member.phone}</a>}
                          {member.email && <a href={`mailto:${member.email}`} className="break-all text-lion-gold">{member.email}</a>}
                          {!member.phone && !member.email && <span className="text-lion-muted">未提供聯絡方式</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <button
          onClick={toggleRegister}
          disabled={event.isCheckedIn || toggling || saving || deleting || editing || checkInBusy || (!event.isRegistered && event.isFull)}
          className={`w-full rounded-xl font-semibold py-3 text-sm transition-colors disabled:opacity-60 ${
            event.isRegistered ? "bg-white/10 text-lion-cream" : "bg-lion-action text-lion-navyDeep"
          }`}
        >
          {toggling ? "更新報名狀態中…" : event.isCheckedIn ? "已報到，無法自行取消" : event.isRegistered ? "已報名（點擊取消）" : event.isFull ? "名額已滿" : "我要報名"}
        </button>

        <Link href="/notifications" className="touch-link flex min-h-12 justify-center text-center text-sm text-lion-gold mt-4">
          通知好友一起參加 →
        </Link>
      </div>

      {scanning && (
        <FriendQrScanner
          title="掃會員證報到"
          subtitle="將會員的數位會員證 QR 對準掃描框"
          continuous
          resetKey={scanKey}
          busy={checkInBusy}
          onScan={(decodedText) => void handleCheckInScan(decodedText)}
          onClose={() => setScanning(false)}
        >
          <p className="mb-2 text-center text-base font-semibold">已到 {checkedInCount}／應到 {registeredCount} 人</p>
          {checkInFeedback}
        </FriendQrScanner>
      )}
      <AccessibleDialog open={Boolean(manualMember)} onClose={() => { if (!checkInBusy) setManualMember(null); }} title="人工補登報到" busy={checkInBusy} description="僅供已報名會員；請先核對本人與名單，補登會保留操作者、原因與時間。">
        {manualMember && <form onSubmit={(formEvent) => { formEvent.preventDefault(); if (manualConfirmed && manualReason.trim().length >= 2) void submitCheckIn({ memberId: manualMember.id, method: "manual", reason: manualReason.trim() }); }}>
          <p className="mb-3 break-words text-lg font-semibold">{manualMember.name}{manualMember.nickname ? `（${manualMember.nickname}）` : ""}</p><p className="mb-4 text-sm text-lion-muted">{manualMember.organization.name}</p>
          <label htmlFor="manual-check-in-reason" className="mb-1 block text-base">補登原因（2–1000 字）</label><textarea id="manual-check-in-reason" required minLength={2} maxLength={1000} value={manualReason} disabled={checkInBusy} onChange={(change) => { setManualReason(change.target.value); setManualConfirmed(false); }} rows={3} className="w-full rounded-xl border border-lion-border bg-lion-page px-3 py-3 text-base" placeholder="例如：已核對本人，會員手機無法顯示 QR" />
          <label className="my-3 flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" checked={manualConfirmed} disabled={checkInBusy} onChange={(change) => setManualConfirmed(change.target.checked)} className="h-5 w-5 shrink-0" />我已核對 {manualMember.name} 本人及報名資料</label>
          {checkInState === "error" && <p role="alert" className="mb-3 text-base text-lion-danger">{checkInToast}</p>}
          <button type="submit" disabled={checkInBusy || !manualConfirmed || manualReason.trim().length < 2} className="min-h-12 w-full rounded-xl bg-lion-action px-3 text-base font-semibold text-lion-navyDeep disabled:opacity-50">{checkInBusy ? "補登中…" : `確認為 ${manualMember.name} 補登`}</button>
        </form>}
      </AccessibleDialog>
    </AppShell>
  );
}
