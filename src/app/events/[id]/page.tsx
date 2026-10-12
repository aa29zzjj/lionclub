"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import { PinIcon } from "@/components/icons";

type EventDetail = {
  id: string;
  title: string;
  description?: string;
  location: string;
  capacity?: number;
  coverPhotoUrl?: string;
  hostChapter: string;
  startAt: string;
  isRegistered: boolean;
  registeredCount: number;
  isFull: boolean;
  canManage: boolean;
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
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [description, setDescription] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [error, setError] = useState("");

  function loadForm(nextEvent: EventDetail) {
    const date = new Date(nextEvent.startAt);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    setTitle(nextEvent.title);
    setStartAt(local);
    setLocation(nextEvent.location);
    setCapacity(nextEvent.capacity ? String(nextEvent.capacity) : "");
    setDescription(nextEvent.description ?? "");
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
    fetch(`/api/events/${params.id}`)
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setEvent(data.event);
          loadForm(data.event);
        }
      })
      .finally(() => setLoading(false));
  }, [params.id, router]);

  async function toggleRegister() {
    if (!event) return;
    setToggling(true);
    const res = await fetch(`/api/events/${event.id}/register`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setEvent((prev) => prev ? {
        ...prev,
        isRegistered: data.registered,
        registeredCount: prev.registeredCount + (data.registered ? 1 : -1),
        isFull: Boolean(prev.capacity && prev.registeredCount + (data.registered ? 1 : -1) >= prev.capacity),
      } : prev);
    } else {
      setError(data.error ?? "報名狀態更新失敗");
    }
    setToggling(false);
  }

  async function saveEvent(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!event) return;
    setSaving(true);
    setError("");

    let coverPhotoUrl = event.coverPhotoUrl ?? null;
    if (coverFile) {
      const signResponse = await fetch("/api/events/cover-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: coverFile.type, size: coverFile.size }),
      });
      const signResult = await signResponse.json();
      if (!signResponse.ok) {
        setError(signResult.error ?? "無法準備封面照片上傳");
        setSaving(false);
        return;
      }
      const uploadResponse = await fetch(signResult.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": coverFile.type },
        body: coverFile,
      });
      if (!uploadResponse.ok) {
        setError("封面照片上傳失敗，請稍後再試");
        setSaving(false);
        return;
      }
      coverPhotoUrl = signResult.coverPhotoUrl;
    }

    const response = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        startAt: new Date(startAt).toISOString(),
        location,
        capacity: capacity ? Number(capacity) : null,
        description: description || null,
        coverPhotoUrl,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "活動更新失敗");
      setSaving(false);
      return;
    }
    setEvent((current) => current ? {
      ...current,
      title,
      startAt: new Date(startAt).toISOString(),
      location,
      capacity: capacity ? Number(capacity) : undefined,
      description: description || undefined,
      coverPhotoUrl: coverPhotoUrl ?? undefined,
      isFull: Boolean(capacity && current.registeredCount >= Number(capacity)),
    } : current);
    setEditing(false);
    setSaving(false);
  }

  async function deleteEvent() {
    if (!event || !window.confirm(`確定刪除「${event.title}」嗎？相關報名與通知也會移除。`)) return;
    const response = await fetch(`/api/events/${event.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "活動刪除失敗");
      return;
    }
    router.replace("/events");
    router.refresh();
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
          <p className="text-lion-cream">找不到這個活動，可能已被移除。</p>
          <Link href="/events" className="text-lion-gold text-sm">
            返回活動列表
          </Link>
        </div>
      </AppShell>
    );
  }

  const dateLabel = new Date(event.startAt).toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <AppShell showNav={false}>
      <div className="px-5 pt-6 pb-8">
        <button onClick={() => router.back()} className="text-sm text-lion-muted mb-4">
          ← 返回
        </button>

        {event.coverPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.coverPhotoUrl} alt="" className="h-36 w-full rounded-2xl object-cover mb-4" />
        ) : (
          <div className="h-36 rounded-2xl bg-gradient-to-br from-lion-navyLight to-[#2E4A8A] mb-4" />
        )}

        <div className="flex items-start justify-between gap-3 mb-2">
          <h1 className="text-xl font-bold">{event.title}</h1>
          {event.canManage && !editing && (
            <button onClick={() => setEditing(true)} className="shrink-0 text-xs text-lion-gold">編輯活動</button>
          )}
        </div>
        <div className="flex items-center gap-2 mb-4">
          <Avatar name={event.hostChapter} color="#3D5A99" size={28} />
          <p className="text-sm text-lion-muted">{event.hostChapter} 主辦</p>
        </div>

        {editing ? (
          <form onSubmit={saveEvent} className="rounded-2xl bg-lion-card border border-lion-gold/20 p-4 flex flex-col gap-3 mb-4">
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
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleCoverChange}
            />
            <input value={title} onChange={(e) => setTitle(e.target.value)} required className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 text-sm" placeholder="活動名稱" />
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 text-sm" />
            <input value={location} onChange={(e) => setLocation(e.target.value)} required className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 text-sm" placeholder="地點" />
            <input type="number" min={event.registeredCount || 1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 text-sm" placeholder="名額（留白為不限）" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 text-sm resize-none" placeholder="活動說明" />
            <div className="flex gap-2">
              <button type="button" onClick={() => { loadForm(event); setEditing(false); setError(""); }} className="flex-1 rounded-xl bg-white/10 py-2 text-sm">取消</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-lion-gold text-lion-navyDeep py-2 text-sm font-semibold disabled:opacity-50">{saving ? "儲存中…" : "儲存"}</button>
            </div>
            <button type="button" onClick={deleteEvent} className="text-xs text-red-300 py-1">刪除活動</button>
          </form>
        ) : <div className="rounded-2xl bg-lion-card border border-white/[0.06] p-4 flex flex-col gap-3 mb-4">
          <div className="flex items-start gap-2.5 text-sm">
            <span className="text-lion-gold">🗓</span>
            <span>{dateLabel}</span>
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

        {error && <p className="mb-4 text-sm text-red-300">{error}</p>}

        {event.description && (
          <div className="mb-6">
            <h2 className="font-semibold mb-2">活動說明</h2>
            <p className="text-sm text-lion-cream/70 leading-relaxed">{event.description}</p>
          </div>
        )}

        <button
          onClick={toggleRegister}
          disabled={toggling || (!event.isRegistered && event.isFull)}
          className={`w-full rounded-xl font-semibold py-3 text-sm transition-colors disabled:opacity-60 ${
            event.isRegistered ? "bg-white/10 text-lion-cream" : "bg-lion-gold text-lion-navyDeep"
          }`}
        >
          {event.isRegistered ? "已報名（點擊取消）" : event.isFull ? "名額已滿" : "我要報名"}
        </button>

        <Link href="/notifications" className="block text-center text-xs text-lion-gold mt-4">
          通知好友一起參加 →
        </Link>
      </div>
    </AppShell>
  );
}
