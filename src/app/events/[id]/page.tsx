"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import { PinIcon } from "@/components/icons";
import { useAppData } from "@/lib/store";

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile, events } = useAppData();
  const [registered, setRegistered] = useState(false);

  const event = events.find((e) => e.id === params.id);

  if (!event) {
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

  return (
    <AppShell showNav={false}>
      <div className="px-5 pt-6 pb-8">
        <button onClick={() => router.back()} className="text-sm text-lion-muted mb-4">
          ← 返回
        </button>

        <div className="h-36 rounded-2xl bg-gradient-to-br from-lion-navyLight to-[#2E4A8A] mb-4" />

        <h1 className="text-xl font-bold mb-2">{event.title}</h1>
        <div className="flex items-center gap-2 mb-4">
          <Avatar name={event.hostChapter ?? profile.chapter} color="#3D5A99" size={28} />
          <p className="text-sm text-lion-muted">{event.hostChapter ?? profile.chapter} 主辦</p>
        </div>

        <div className="rounded-2xl bg-lion-card border border-white/[0.06] p-4 flex flex-col gap-3 mb-4">
          <div className="flex items-start gap-2.5 text-sm">
            <span className="text-lion-gold">🗓</span>
            <span>{event.date}</span>
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
          onClick={() => setRegistered((v) => !v)}
          className={`w-full rounded-xl font-semibold py-3 text-sm transition-colors ${
            registered ? "bg-white/10 text-lion-cream" : "bg-lion-gold text-lion-navyDeep"
          }`}
        >
          {registered ? "已報名（點擊取消）" : "我要報名"}
        </button>

        <Link
          href="/notifications"
          className="block text-center text-xs text-lion-gold mt-4"
        >
          通知好友一起參加 →
        </Link>
      </div>
    </AppShell>
  );
}
