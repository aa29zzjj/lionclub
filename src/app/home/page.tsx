"use client";

import PhoneShell from "@/components/PhoneShell";
import Avatar from "@/components/Avatar";
import { currentUser, upcomingEvents, initialFriends } from "@/lib/mock-data";

export default function HomePage() {
  return (
    <PhoneShell>
      <div className="px-5 pt-10 pb-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Avatar name={currentUser.name} color={currentUser.avatarColor} />
            <div>
              <p className="text-sm text-lion-cream/60">嗨，歡迎回來</p>
              <p className="font-semibold">{currentUser.name}</p>
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-lg">🔔</div>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-lion-gold to-lion-goldLight text-lion-navyDeep p-4 mb-6">
          <p className="text-xs font-medium opacity-70">所屬分會</p>
          <p className="text-lg font-bold">{currentUser.chapter}</p>
          <p className="text-xs mt-1 opacity-70">{currentUser.title}</p>
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lion-cream">即將舉辦的活動</h2>
          <span className="text-xs text-lion-gold">查看全部</span>
        </div>
        <div className="flex flex-col gap-3 mb-6">
          {upcomingEvents.slice(0, 2).map((ev) => (
            <div key={ev.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
              <p className="font-medium text-sm">{ev.title}</p>
              <p className="text-xs text-lion-cream/50 mt-1">{ev.date}</p>
              <p className="text-xs text-lion-cream/50">{ev.location}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lion-cream">好友動態</h2>
          <span className="text-xs text-lion-gold">{initialFriends.length} 位好友</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {initialFriends.map((f) => (
            <div key={f.id} className="flex flex-col items-center gap-1 w-16 shrink-0">
              <Avatar name={f.name} color={f.avatarColor} size={52} />
              <p className="text-[11px] text-lion-cream/70 truncate w-full text-center">{f.name}</p>
            </div>
          ))}
        </div>
      </div>
    </PhoneShell>
  );
}
