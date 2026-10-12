"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import { PinIcon, PlusIcon } from "@/components/icons";

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
  registeredCount: number;
  isFull: boolean;
  hostChapter: string;
  startAt: string;
};

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState("");

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  function loadEvents() {
    return fetch("/api/events")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) setEvents(data.events ?? []);
      });
  }

  useEffect(() => {
    loadEvents().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setTitle("");
    setDate("");
    setTime("");
    setLocation("");
    setCapacity("");
    setDescription("");
    setError("");
    setCreating(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !date || !location) {
      setError("請填寫活動名稱、日期與地點");
      return;
    }
    const startAt = new Date(`${date}T${time || "00:00"}`).toISOString();
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        startAt,
        location,
        description: description || undefined,
        capacity: capacity ? Number(capacity) : undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "發布失敗，請再試一次");
      return;
    }
    setToast("活動已發布");
    resetForm();
    await loadEvents();
    setTimeout(() => setToast(""), 2500);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <AppShell>
        <div className="px-5 pt-6 pb-4">
          <p className="text-sm text-lion-muted text-center py-12">載入中...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">活動</h1>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 text-xs font-medium bg-lion-gold text-lion-navyDeep px-3 py-1.5 rounded-full"
          >
            <PlusIcon className="w-3.5 h-3.5" /> 發布活動
          </button>
        </div>

        {toast && (
          <div className="mb-4 rounded-xl bg-lion-gold/15 border border-lion-gold/40 text-lion-gold text-xs px-3 py-2">
            {toast}
          </div>
        )}

        {!creating && (
          <div className="flex flex-col gap-4">
            {events.length === 0 && <p className="text-sm text-lion-muted text-center py-8">目前沒有活動</p>}
            {events.map((ev, i) => (
              <Link
                key={ev.id}
                href={`/events/${ev.id}`}
                className="block rounded-2xl bg-lion-card border border-white/[0.06] overflow-hidden"
              >
                <div className="p-3.5 pb-0 flex items-center gap-2.5">
                  <Avatar name={ev.hostChapter} color="#3D5A99" size={30} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{ev.title}</p>
                    <p className="text-[11px] text-lion-muted">{formatDate(ev.startAt)}</p>
                  </div>
                </div>
                <div className={`mx-3.5 mt-3 h-24 rounded-xl bg-gradient-to-br ${eventGradients[i % eventGradients.length]}`} />
                <div className="flex items-center justify-between px-3.5 py-3">
                  <p className="text-[11px] text-lion-muted flex items-center gap-1">
                    <PinIcon className="w-3.5 h-3.5" /> {ev.location}
                  </p>
                  <span className="text-xs text-lion-gold font-medium">查看詳情 →</span>
                </div>
                {ev.capacity && (
                  <div className="px-3.5 pb-3 text-[11px] text-lion-muted">
                    已報名 {ev.registeredCount}／{ev.capacity} 人{ev.isFull ? " · 名額已滿" : ""}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}

        {creating && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-lion-muted mb-1 block">活動名稱</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：分會例會暨新舊任交接"
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm placeholder:text-lion-cream/30 outline-none focus:border-lion-gold"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-lion-muted mb-1 block">日期</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm outline-none focus:border-lion-gold"
                />
              </div>
              <div>
                <label className="text-xs text-lion-muted mb-1 block">時間</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm outline-none focus:border-lion-gold"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-lion-muted mb-1 block">地點</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="活動地點"
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm placeholder:text-lion-cream/30 outline-none focus:border-lion-gold"
              />
            </div>
            <div>
              <label className="text-xs text-lion-muted mb-1 block">名額（選填）</label>
              <input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="例如：50"
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm placeholder:text-lion-cream/30 outline-none focus:border-lion-gold"
              />
            </div>
            <div>
              <label className="text-xs text-lion-muted mb-1 block">活動說明（選填）</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="簡述活動內容、流程或注意事項"
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2.5 text-sm placeholder:text-lion-cream/30 outline-none focus:border-lion-gold resize-none"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 rounded-xl bg-white/10 text-lion-cream/70 font-medium py-2.5 text-sm"
              >
                取消
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-lion-gold text-lion-navyDeep font-semibold py-2.5 text-sm"
              >
                發布活動
              </button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}
