"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import QrModal from "@/components/QrModal";
import { BellIcon, QrIcon, PinIcon } from "@/components/icons";
import { colorFromId } from "@/lib/avatar-color";
import { createFriendQrPayload } from "@/lib/friend-qr";
import { formatJoinDate } from "@/lib/experience-data";
import { partitionEvents } from "@/lib/event-list";
import { EVENT_TIME_ZONE } from "@/lib/event-calendar";

const eventGradients = [
  "from-lion-navyLight to-[#2E4A8A]",
  "from-[#4A3A1E] to-[#8A6A2E]",
  "from-[#1E3A3A] to-[#2E6A5A]",
];

type Me = {
  id: string;
  name: string;
  title: string | null;
  photoUrl: string | null;
  memberNo: string | null;
  joinYear: number | null;
  joinMonth: number | null;
  organization: { name: string };
};
type Friend = { id: string; name: string; nickname?: string; chapter: string; photoUrl?: string };
type EventCard = { id: string; title: string; location: string; coverPhotoUrl?: string; hostChapter: string; startAt: string };

export default function HomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incomingCount, setIncomingCount] = useState(0);
  const [events, setEvents] = useState<EventCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQr, setShowQr] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const upcomingEvents = partitionEvents(events, now).upcoming;

  useEffect(() => {
    Promise.all([
      fetch("/api/me").then(async (res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        return res.json();
      }),
      fetch("/api/friends").then((res) => res.json()),
      fetch("/api/events").then((res) => res.json()),
    ])
      .then(([meData, friendsData, eventsData]) => {
        if (!meData) return;
        setMe(meData);
        setFriends(friendsData.friends ?? []);
        setIncomingCount((friendsData.incoming ?? []).length);
        setEvents(eventsData.events ?? []);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  if (loading || !me) {
    return (
      <AppShell>
        <div className="px-5 pt-6 pb-6">
          <p className="text-sm text-lion-muted text-center py-12">載入中...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white border border-lion-gold flex items-center justify-center p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/lions-logo.svg" alt="Lions Clubs International" className="w-full h-full object-contain" />
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
          <Avatar name={me.name} color={colorFromId(me.id)} imageUrl={me.photoUrl} size={36} />
          <div>
            <p className="text-sm text-lion-muted leading-tight">嗨，歡迎回來</p>
            <p className="text-lg font-bold leading-tight">{me.name}</p>
          </div>
        </Link>

        {/* 數位會員證 */}
        <div className="theme-brand-panel relative rounded-2xl bg-gradient-to-br from-lion-navy via-lion-navyLight to-[#2a3660] border border-white/[0.06] p-4 mb-6 overflow-hidden">
          <div className="absolute -right-6 -top-10 w-32 h-32 rounded-full bg-white/[0.04]" />
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-white border border-lion-gold flex items-center justify-center p-0.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/lions-logo.svg" alt="Lions Clubs International" className="w-full h-full object-contain" />
            </span>
            <span className="text-xs tracking-widest text-lion-gold font-medium">LIONS CLUBS · 數位會員證</span>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <Avatar name={me.name} color={colorFromId(me.id)} imageUrl={me.photoUrl} size={44} />
            <div>
              <p className="font-semibold leading-tight">{me.name}</p>
              <p className="text-xs text-lion-muted">
                {me.organization.name} · {me.title ?? "會員"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-y-2 border-t border-white/10 pt-3 text-xs">
            <div>
              <p className="text-lion-muted mb-0.5">會員編號</p>
              <p className="font-medium">{me.memberNo || "—"}</p>
            </div>
            <div>
              <p className="text-lion-muted mb-0.5">入會年度</p>
              <p className="font-medium">{formatJoinDate(me.joinYear, me.joinMonth) ?? "—"}</p>
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
            subtitle={`${me.name} · ${me.organization.name}`}
            value={createFriendQrPayload(me.id)}
            onClose={() => setShowQr(false)}
          />
        )}

        <div className="grid grid-cols-3 gap-3 mb-6">
          <Link href="/friends" className="rounded-xl bg-white/[0.04] border border-white/[0.06] py-3 text-center">
            <p className="text-lion-gold font-bold text-lg leading-tight">{friends.length}</p>
            <p className="text-[11px] text-lion-muted mt-0.5">好友</p>
          </Link>
          <Link href="/friends" className="rounded-xl bg-white/[0.04] border border-white/[0.06] py-3 text-center">
            <p className="text-lion-gold font-bold text-lg leading-tight">{incomingCount}</p>
            <p className="text-[11px] text-lion-muted mt-0.5">待確認邀請</p>
          </Link>
          <Link href="/events" className="rounded-xl bg-white/[0.04] border border-white/[0.06] py-3 text-center">
            <p className="text-lion-gold font-bold text-lg leading-tight">{upcomingEvents.length}</p>
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
          {upcomingEvents.length === 0 && <p className="text-sm text-lion-muted">目前沒有即將舉辦的活動。</p>}
          {upcomingEvents.slice(0, 2).map((ev, i) => (
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
              {ev.coverPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ev.coverPhotoUrl} alt="" className="mx-3.5 mt-3 h-24 w-[calc(100%-1.75rem)] rounded-xl object-cover" />
              ) : (
                <div className={`mx-3.5 mt-3 h-24 rounded-xl bg-gradient-to-br ${eventGradients[i % eventGradients.length]}`} />
              )}
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
            <Link key={f.id} href={`/members/${f.id}`} className="flex flex-col items-center gap-1.5 w-16 shrink-0">
              <Avatar name={f.name} color={colorFromId(f.id)} imageUrl={f.photoUrl} size={52} />
              <p className="text-[11px] text-lion-cream/70 truncate w-full text-center">{f.nickname || f.name}</p>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
