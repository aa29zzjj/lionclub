"use client";

import { useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import QrModal from "@/components/QrModal";
import { BellIcon, QrIcon, PinIcon } from "@/components/icons";
import { useAppData } from "@/lib/store";

const eventGradients = [
  "from-lion-navyLight to-[#2E4A8A]",
  "from-[#4A3A1E] to-[#8A6A2E]",
  "from-[#1E3A3A] to-[#2E6A5A]",
];

export default function HomePage() {
  const { profile, friends, incoming, events } = useAppData();
  const [showQr, setShowQr] = useState(false);

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-lion-gold/15 border border-lion-gold flex items-center justify-center text-sm">
              🦁
            </div>
            <span className="font-bold tracking-wide">獅子會</span>
          </div>
          <Link
            href="/notifications"
            className="w-9 h-9 rounded-full bg-white/5 border border-white/[0.06] flex items-center justify-center text-lion-cream/70"
          >
            <BellIcon className="w-[18px] h-[18px]" />
          </Link>
        </div>

        <Link href="/profile" className="flex items-center gap-3 mb-4">
          <Avatar name={profile.name} color={profile.avatarColor} imageUrl={profile.avatarUrl} size={36} />
          <div>
            <p className="text-sm text-lion-muted leading-tight">嗨，歡迎回來</p>
            <p className="text-lg font-bold leading-tight">{profile.name}</p>
          </div>
        </Link>

        {/* 數位會員證 */}
        <div className="relative rounded-2xl bg-gradient-to-br from-lion-navy via-lion-navyLight to-[#2a3660] border border-white/[0.06] p-4 mb-6 overflow-hidden">
          <div className="absolute -right-6 -top-10 w-32 h-32 rounded-full bg-white/[0.04]" />
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-lion-gold/20 border border-lion-gold flex items-center justify-center text-[11px]">
              🦁
            </span>
            <span className="text-xs tracking-widest text-lion-gold font-medium">LIONS CLUBS · 數位會員證</span>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <Avatar name={profile.name} color={profile.avatarColor} imageUrl={profile.avatarUrl} size={44} />
            <div>
              <p className="font-semibold leading-tight">{profile.name}</p>
              <p className="text-xs text-lion-muted">
                {profile.chapter} · {profile.title}
              </p>
              {profile.districtCode && (
                <p className="text-[10px] text-lion-gold/75 mt-0.5">
                  MD{profile.multipleDistrictCode} · {profile.districtCode} 區
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-y-2 border-t border-white/10 pt-3 text-xs">
            <div>
              <p className="text-lion-muted mb-0.5">會員編號</p>
              <p className="font-medium">{profile.memberNo}</p>
            </div>
            <div>
              <p className="text-lion-muted mb-0.5">入會年度</p>
              <p className="font-medium">{profile.joinYear}</p>
            </div>
            <div>
              <p className="text-lion-muted mb-0.5">身分別</p>
              <p className="font-medium">{profile.title}</p>
            </div>
            <div>
              <p className="text-lion-muted mb-0.5">有效期限</p>
              <p className="font-medium">{profile.validUntil}</p>
            </div>
          </div>
          <button
            onClick={() => setShowQr(true)}
            className="mt-3 w-full flex items-center justify-between rounded-xl bg-black/20 px-3 py-2.5 hover:bg-black/30 transition-colors"
          >
            <p className="text-[11px] text-lion-muted leading-snug pr-3 text-left">
              掃描條碼供活動報到、資源媒合驗證身分
            </p>
            <span className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0">
              <QrIcon className="w-5 h-5 text-lion-navyDeep" />
            </span>
          </button>
        </div>

        {showQr && (
          <QrModal
            title="我的會員證 QR Code"
            subtitle={`${profile.name} · ${profile.chapter}`}
            seed={profile.id}
            onClose={() => setShowQr(false)}
          />
        )}

        <div className="grid grid-cols-3 gap-3 mb-6">
          <Link href="/friends" className="rounded-xl bg-white/[0.04] border border-white/[0.06] py-3 text-center">
            <p className="text-lion-gold font-bold text-lg leading-tight">{friends.length}</p>
            <p className="text-[11px] text-lion-muted mt-0.5">好友</p>
          </Link>
          <Link href="/friends" className="rounded-xl bg-white/[0.04] border border-white/[0.06] py-3 text-center">
            <p className="text-lion-gold font-bold text-lg leading-tight">{incoming.length}</p>
            <p className="text-[11px] text-lion-muted mt-0.5">待確認邀請</p>
          </Link>
          <Link href="/events" className="rounded-xl bg-white/[0.04] border border-white/[0.06] py-3 text-center">
            <p className="text-lion-gold font-bold text-lg leading-tight">{events.length}</p>
            <p className="text-[11px] text-lion-muted mt-0.5">即將舉辦</p>
          </Link>
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">即將舉辦的活動</h2>
          <Link href="/events" className="text-xs text-lion-gold">
            查看全部
          </Link>
        </div>
        <div className="flex flex-col gap-4 mb-6">
          {events.slice(0, 2).map((ev, i) => (
            <Link
              key={ev.id}
              href={`/events/${ev.id}`}
              className="block rounded-2xl bg-lion-card border border-white/[0.06] overflow-hidden"
            >
              <div className="p-3.5 pb-0 flex items-center gap-2.5">
                <Avatar name={ev.hostChapter ?? profile.chapter} color="#3D5A99" size={30} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{ev.title}</p>
                  <p className="text-[11px] text-lion-muted">{ev.date}</p>
                </div>
              </div>
              <div className={`mx-3.5 mt-3 h-24 rounded-xl bg-gradient-to-br ${eventGradients[i % eventGradients.length]}`} />
              <div className="flex items-center justify-between px-3.5 py-3">
                <p className="text-[11px] text-lion-muted flex items-center gap-1">
                  <PinIcon className="w-3.5 h-3.5" /> {ev.location}
                </p>
                <span className="text-xs text-lion-gold font-medium">查看詳情 →</span>
              </div>
            </Link>
          ))}
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">好友動態</h2>
          <Link href="/friends" className="text-xs text-lion-gold">
            {friends.length} 位好友
          </Link>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-1">
          {friends.map((f) => (
            <Link key={f.id} href="/friends" className="flex flex-col items-center gap-1.5 w-16 shrink-0">
              <Avatar name={f.name} color={f.avatarColor} size={52} />
              <p className="text-[11px] text-lion-cream/70 truncate w-full text-center">{f.name}</p>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
