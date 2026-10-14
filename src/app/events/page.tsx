"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import { CalendarIcon, PinIcon, PlusIcon } from "@/components/icons";
import { EVENT_TIME_ZONE, taipeiEventStartAt } from "@/lib/event-calendar";
import { EVENT_CATEGORIES, eventCategoryLabels, type EventCategory } from "@/lib/event-category";
import { eventScopeLabels, type EventScope } from "@/lib/event-scope";

const eventGradients = [
  "from-lion-navyLight to-[#2E4A8A]",
  "from-[#4A3A1E] to-[#8A6A2E]",
  "from-[#1E3A3A] to-[#2E6A5A]",
];

type EventCard = {
  id: string;
  title: string;
  location: string;
  description?: string;
  capacity?: number;
  category: EventCategory;
  scope: EventScope;
  coverPhotoUrl?: string;
  registeredCount: number;
  isFull: boolean;
  hostChapter: string;
  startAt: string;
};

export default function EventsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const submitLock = useRef(false);
  const [events, setEvents] = useState<EventCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [description, setDescription] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [category, setCategory] = useState<EventCategory>("CLUB_OFFICIAL");
  const [scope, setScope] = useState<EventScope>("CLUB");
  const [allowedScopes, setAllowedScopes] = useState<EventScope[]>(["CLUB"]);
  const [filter, setFilter] = useState<EventCategory | "ALL">("ALL");
  const [error, setError] = useState("");

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("請選擇 5 MB 內的 JPG、PNG 或 WebP 圖片");
      return;
    }
    setError("");
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  }

  const loadEvents = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/events", { cache: "no-store", signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (controller.signal.aborted) return;
      if (res.status === 401) {
        setEvents([]);
        setLoadError("登入已過期，正在前往登入頁。");
        router.replace("/login?reason=session-expired");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "無法載入活動，請重試。");
      if (!Array.isArray(data.events)) throw new Error("活動資料格式異常，請重新載入。");
      setEvents(data.events);
      if (Array.isArray(data.allowedScopes)) setAllowedScopes(data.allowedScopes);
    } catch (caught) {
      if (!controller.signal.aborted) setLoadError(caught instanceof Error && !(caught instanceof TypeError) ? caught.message : "網路連線中斷，請確認網路後重試。");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadEvents();
    return () => requestRef.current?.abort();
  }, [loadEvents]);

  useEffect(() => () => {
    if (coverPreview?.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
  }, [coverPreview]);

  function resetForm() {
    setTitle("");
    setDate("");
    setTime("");
    setLocation("");
    setCapacity("");
    setDescription("");
    setCoverFile(null);
    setCoverPreview(null);
    setCategory("CLUB_OFFICIAL");
    setScope("CLUB");
    setError("");
    setCreating(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitLock.current) return;
    if (!title.trim() || !date || !location.trim()) {
      setError("請填寫活動名稱、日期與地點");
      return;
    }
    const startAt = taipeiEventStartAt(date, time || "00:00");
    if (!startAt) {
      setError("請確認活動日期與時間是否正確（台灣時間）");
      return;
    }
    if (capacity && (!Number.isInteger(Number(capacity)) || Number(capacity) < 1)) {
      setError("名額請填寫大於 0 的整數，或留空不限制");
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setError("");
    let publicationStarted = false;
    try {
      let coverPhotoUrl: string | undefined;
      if (coverFile) {
        const signResponse = await fetch("/api/events/cover-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentType: coverFile.type, size: coverFile.size }),
        });
        const signResult = await signResponse.json().catch(() => ({}));
        if (signResponse.status === 401) {
          router.replace("/login?reason=session-expired");
          setError("登入已過期，請重新登入後再發布。");
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

      publicationStarted = true;
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          startAt,
          location: location.trim(),
          description: description.trim() || undefined,
          capacity: capacity ? Number(capacity) : undefined,
          coverPhotoUrl,
          category,
          scope: category === "CLUB_OFFICIAL" ? scope : undefined,
        }),
      });
      if (res.status === 401) {
        router.replace("/login?reason=session-expired");
        setError("登入已過期，請重新登入後再發布。");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "發布失敗，請再試一次");
        return;
      }
      setToast("活動已發布");
      resetForm();
      await loadEvents();
    } catch {
      setError(publicationStarted
        ? "發布時連線中斷，活動可能已送出。請先返回列表確認，避免重複發布。"
        : "照片上傳時連線中斷，尚未發布活動，請稍後重試。");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

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

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h1 className="text-2xl font-bold">活動</h1>
          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={submitting || creating}
            className="flex min-h-12 items-center gap-1 text-base font-medium bg-lion-action text-lion-navyDeep px-4 py-2 rounded-xl disabled:opacity-50"
          >
            <PlusIcon className="w-5 h-5" /> 發布活動
          </button>
        </div>

        <Link href="/events/calendar" className="mb-4 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-lion-border bg-lion-card px-4 py-3 text-base font-semibold text-lion-gold">
          <CalendarIcon className="h-5 w-5" /> 活動行事曆
        </Link>

        {toast && (
          <div role="status" className="mb-4 rounded-xl bg-lion-soft border border-lion-border text-lion-cream text-base px-4 py-3">
            {toast}
          </div>
        )}

        {!creating && (
          <div className="flex flex-col gap-4" aria-busy={loading}>
            <div className="flex gap-1 rounded-xl bg-lion-soft p-1" role="group" aria-label="活動分類篩選">
              {(["ALL", ...EVENT_CATEGORIES] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                  className={`flex-1 min-h-10 rounded-lg px-2 text-sm font-medium ${filter === value ? "bg-lion-action text-lion-navyDeep" : "text-lion-muted"}`}
                >
                  {value === "ALL" ? "全部" : eventCategoryLabels[value]}
                </button>
              ))}
            </div>
            {loading && <p role="status" className="text-base text-lion-muted text-center py-8">正在載入活動…</p>}
            {loadError && <div role="alert" className="rounded-xl border border-lion-danger/40 bg-lion-card p-4"><p className="text-base text-lion-danger">{loadError}</p><button type="button" onClick={() => void loadEvents()} disabled={loading} className="mt-3 min-h-12 rounded-xl bg-lion-action px-5 text-base font-semibold text-lion-navyDeep disabled:opacity-50">重新載入活動</button></div>}
            {!loading && !loadError && events.filter((ev) => filter === "ALL" || ev.category === filter).length === 0 && <p className="text-base text-lion-muted text-center py-8">目前沒有符合的活動，也可從行事曆查看不同月份。</p>}
            {!loading && !loadError && events.filter((ev) => filter === "ALL" || ev.category === filter).map((ev, i) => (
              <Link
                key={ev.id}
                href={`/events/${ev.id}`}
                className="block rounded-2xl bg-lion-card border border-lion-border overflow-hidden"
              >
                <div className="p-3.5 pb-0 flex items-center gap-2.5">
                  <Avatar name={ev.hostChapter} color="#3D5A99" size={30} />
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-semibold break-words">{ev.title}</p>
                    <p className="text-sm text-lion-muted">{formatDate(ev.startAt)}（台灣時間）</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${ev.category === "CLUB_OFFICIAL" ? "bg-lion-gold/15 text-lion-gold" : "bg-white/10 text-lion-muted"}`}>
                      {eventCategoryLabels[ev.category]}
                    </span>
                    {ev.scope !== "CLUB" && (
                      <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] text-lion-muted">{eventScopeLabels[ev.scope]}</span>
                    )}
                  </div>
                </div>
                {ev.coverPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ev.coverPhotoUrl} alt="" className="mx-3.5 mt-3 h-24 w-[calc(100%-1.75rem)] rounded-xl object-cover" />
                ) : (
                  <div className={`mx-3.5 mt-3 h-24 rounded-xl bg-gradient-to-br ${eventGradients[i % eventGradients.length]}`} />
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-3">
                  <p className="text-base text-lion-muted flex items-center gap-1">
                    <PinIcon className="w-3.5 h-3.5" /> {ev.location}
                  </p>
                  <span className="text-base text-lion-gold font-medium">查看詳情 →</span>
                </div>
                {ev.capacity && (
                  <div className="px-3.5 pb-3 text-sm text-lion-muted">
                    已報名 {ev.registeredCount}／{ev.capacity} 人{ev.isFull ? " · 名額已滿" : ""}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}

        {creating && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" aria-busy={submitting}>
            <p className="text-base text-lion-muted">日期與時間皆以台灣時間發布。</p>
            <fieldset disabled={submitting} className="flex min-w-0 flex-col gap-4 disabled:opacity-70">
            <div>
              <span className="text-base text-lion-muted mb-1 block">活動分類</span>
              <div className="grid grid-cols-2 gap-2">
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
              <p className="mt-1 text-xs text-lion-muted">獅子會活動會標示為分會正式活動；個人／工商活動是會員自己要宣傳的場合，不代表分會立場。</p>
            </div>
            {category === "CLUB_OFFICIAL" && allowedScopes.length > 1 && (
              <div>
                <span className="text-base text-lion-muted mb-1 block">發佈範圍</span>
                <div className="grid grid-cols-2 gap-2">
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
                <p className="mt-1 text-xs text-lion-muted">發佈範圍超過本分會時，僅對應管理角色可選擇；此選單只顯示您有權限發佈的範圍。</p>
              </div>
            )}
            <div>
              <label htmlFor="event-cover" className="text-base text-lion-muted mb-1 block">封面照片（選填）</label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
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
                id="event-cover"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleCoverChange}
              />
            </div>
            <div>
              <label htmlFor="event-title" className="text-base text-lion-muted mb-1 block">活動名稱（必填）</label>
              <input
                id="event-title"
                required
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：分會例會暨新舊任交接"
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm placeholder:text-lion-cream/30 outline-none focus:border-lion-gold"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="event-date" className="text-base text-lion-muted mb-1 block">日期（必填）</label>
                <input
                  id="event-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm outline-none focus:border-lion-gold"
                />
              </div>
              <div>
                <label htmlFor="event-time" className="text-base text-lion-muted mb-1 block">時間（台灣）</label>
                <input
                  id="event-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm outline-none focus:border-lion-gold"
                />
              </div>
            </div>
            <p className="text-sm text-lion-muted">未填時間時，活動會顯示為當日 00:00。</p>
            <div>
              <label htmlFor="event-location" className="text-base text-lion-muted mb-1 block">地點（必填）</label>
              <input
                id="event-location"
                required
                maxLength={240}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="活動地點"
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm placeholder:text-lion-cream/30 outline-none focus:border-lion-gold"
              />
            </div>
            <div>
              <label htmlFor="event-capacity" className="text-base text-lion-muted mb-1 block">名額（選填）</label>
              <input
                id="event-capacity"
                type="number"
                min={1}
                step={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="例如：50"
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm placeholder:text-lion-cream/30 outline-none focus:border-lion-gold"
              />
            </div>
            <div>
              <label htmlFor="event-description" className="text-base text-lion-muted mb-1 block">活動說明（選填）</label>
              <textarea
                id="event-description"
                maxLength={3000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="簡述活動內容、流程或注意事項"
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm placeholder:text-lion-cream/30 outline-none focus:border-lion-gold resize-none"
              />
            </div>

            {error && <p role="alert" className="text-base text-lion-danger">{error}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 min-h-12 rounded-xl bg-lion-soft text-lion-cream font-medium py-3 text-base"
              >
                返回列表
              </button>
              <button
                type="submit"
                className="flex-1 min-h-12 rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-3 text-base"
              >
                {submitting ? "發布中，請稍候…" : "發布活動"}
              </button>
            </div>
            </fieldset>
          </form>
        )}
      </div>
    </AppShell>
  );
}
