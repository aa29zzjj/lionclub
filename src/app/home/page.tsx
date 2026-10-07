"use client";

import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import { BellIcon, QrIcon, PinIcon } from "@/components/icons";
import { currentUser, upcomingEvents, initialFriends } from "@/lib/mock-data";

const eventGradients = [
  "from-lion-navyLight to-[#2E4A8A]",
  "from-[#4A3A1E] to-[#8A6A2E]",
  "from-[#1E3A3A] to-[#2E6A5A]",
];

export default function HomePage() {
  const pendingCount = initialFriends.filter((f) => f.status === "pending-in").length;

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
          <button className="w-9 h-9 rounded-full bg-white/5 border border-white/[0.06] flex items-center justify-center text-lion-cream/70">
            <BellIcon className="w-[18px] h-[18px]" />
          </button>
        </div>

        <p className="text-sm text-lion-muted mb-1">嗨，歡迎回來</p>
        <p className="text-lg font-bold mb-4">{currentUser.name}</p>

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
            <Avatar name={currentUser.name} color={currentUser.avatarColor} size={44} />
            <div>
              <p className="font-semibold leading-tight">{currentUser.name}</p>
              <p className="text-xs text-lion-muted">
                {currentUser.chapter} · {currentUser.title}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-y-2 border-t border-white/10 pt-3 text-xs">
            <div>
              <p className="text-lion-muted mb-0.5">會員編號</p>
              <p className="font-medium">{currentUser.memberNo}</p>
            </div>
            <div>
              <p className="text-lion-muted mb-0.5">入會年度</p>
              <p className="font-medium">{currentUser.joinYear}</p>
            </div>
            <div>
              <p className="text-lion-muted mb-0.5">身分別</p>
              <p className="font-medium">{currentUser.title}</p>
            </div>
            <div>
              <p className="text-lion-muted mb-0.5">有效期限</p>
              <p className="font-medium">{currentUser.validUntil}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-black/20 px-3 py-2.5">
            <p className="text-[11px] text-lion-muted leading-snug pr-3">
              掃描條碼供活動報到、資源媒合驗證身分
            </p>
            <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0">
              <QrIcon className="w-5 h-5 text-lion-navyDeep" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "好友", value: initialFriends.length },
            { label: "待確認邀請", value: pendingCount },
            { label: "即將舉辦", value: upcomingEvents.length },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-white/[0.04] border border-white/[0.06] py-3 text-center">
              <p className="text-lion-gold font-bold text-lg leading-tight">{s.value}</p>
              <p className="text-[11px] text-lion-muted mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">即將舉辦的活動</h2>
          <span className="text-xs text-lion-gold">查看全部</span>
        </div>
        <div className="flex flex-col gap-4 mb-6">
          {upcomingEvents.slice(0, 2).map((ev, i) => (
            <div key={ev.id} className="rounded-2xl bg-lion-card border border-white/[0.06] overflow-hidden">
              <div className="p-3.5 pb-0 flex items-center gap-2.5">
                <Avatar name={currentUser.chapter} color="#3D5A99" size={30} />
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
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">好友動態</h2>
          <span className="text-xs text-lion-gold">{initialFriends.length} 位好友</span>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-1">
          {initialFriends.map((f) => (
            <div key={f.id} className="flex flex-col items-center gap-1.5 w-16 shrink-0">
              <Avatar name={f.name} color={f.avatarColor} size={52} />
              <p className="text-[11px] text-lion-cream/70 truncate w-full text-center">{f.name}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
