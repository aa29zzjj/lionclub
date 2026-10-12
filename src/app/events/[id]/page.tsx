"use client";

import { useEffect, useState } from "react";
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
  hostChapter: string;
  startAt: string;
  isRegistered: boolean;
};

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [toggling, setToggling] = useState(false);

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
        if (data) setEvent(data.event);
      })
      .finally(() => setLoading(false));
  }, [params.id, router]);

  async function toggleRegister() {
    if (!event) return;
    setToggling(true);
    const res = await fetch(`/api/events/${event.id}/register`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setEvent((prev) => (prev ? { ...prev, isRegistered: data.registered } : prev));
    }
    setToggling(false);
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

        <div className="h-36 rounded-2xl bg-gradient-to-br from-lion-navyLight to-[#2E4A8A] mb-4" />

        <h1 className="text-xl font-bold mb-2">{event.title}</h1>
        <div className="flex items-center gap-2 mb-4">
          <Avatar name={event.hostChapter} color="#3D5A99" size={28} />
          <p className="text-sm text-lion-muted">{event.hostChapter} 主辦</p>
        </div>

        <div className="rounded-2xl bg-lion-card border border-white/[0.06] p-4 flex flex-col gap-3 mb-4">
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
              <span>名額 {event.capacity} 人</span>
            </div>
          )}
        </div>

        {event.description && (
          <div className="mb-6">
            <h2 className="font-semibold mb-2">活動說明</h2>
            <p className="text-sm text-lion-cream/70 leading-relaxed">{event.description}</p>
          </div>
        )}

        <button
          onClick={toggleRegister}
          disabled={toggling}
          className={`w-full rounded-xl font-semibold py-3 text-sm transition-colors disabled:opacity-60 ${
            event.isRegistered ? "bg-white/10 text-lion-cream" : "bg-lion-gold text-lion-navyDeep"
          }`}
        >
          {event.isRegistered ? "已報名（點擊取消）" : "我要報名"}
        </button>

        <Link href="/notifications" className="block text-center text-xs text-lion-gold mt-4">
          通知好友一起參加 →
        </Link>
      </div>
    </AppShell>
  );
}
