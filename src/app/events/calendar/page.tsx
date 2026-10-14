"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { CalendarIcon, PinIcon } from "@/components/icons";
import {
  EVENT_TIME_ZONE,
  getCalendarDays,
  getTaipeiDateKey,
  groupEventsByTaipeiDate,
  shiftCalendarMonth,
} from "@/lib/event-calendar";

type CalendarEvent = {
  id: string;
  title: string;
  startAt: string;
  location: string;
  hostChapter: string;
  registeredCount: number;
  capacity?: number;
  isFull: boolean;
  isRegistered?: boolean;
};

const weekDays = ["日", "一", "二", "三", "四", "五", "六"];
const timeFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: EVENT_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false,
});

function dateLabel(key: string) {
  return new Date(`${key}T12:00:00+08:00`).toLocaleDateString("zh-TW", {
    timeZone: EVENT_TIME_ZONE, year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
}

export default function EventCalendarPage() {
  const router = useRouter();
  const [today, setToday] = useState(() => getTaipeiDateKey()!);
  const [month, setMonth] = useState(() => getTaipeiDateKey()!.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(() => getTaipeiDateKey()!);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);

  const loadEvents = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/events", { cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (controller.signal.aborted) return;
      if (response.status === 401) {
        setEvents([]);
        setError("登入已過期，正在前往登入頁。");
        router.replace("/login?reason=session-expired");
        return;
      }
      if (!response.ok) throw new Error(data.error ?? "無法載入活動，請稍後重試。");
      if (!Array.isArray(data.events)) throw new Error("活動資料格式異常，請重新載入。");
      setEvents(data.events);
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(caught instanceof Error && !(caught instanceof TypeError) ? caught.message : "網路連線中斷，請確認網路後重試。");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadEvents();
    return () => requestRef.current?.abort();
  }, [loadEvents]);

  const days = useMemo(() => getCalendarDays(month), [month]);
  const eventsByDate = useMemo(() => groupEventsByTaipeiDate(events), [events]);
  const selectedEvents = eventsByDate.get(selectedDate) ?? [];
  const monthCount = events.reduce((total, event) => total + (getTaipeiDateKey(event.startAt)?.startsWith(`${month}-`) ? 1 : 0), 0);
  const [yearNumber, monthNumber] = month.split("-").map(Number);
  const monthLabel = `${yearNumber} 年 ${monthNumber} 月`;

  function changeMonth(offset: number) {
    const next = shiftCalendarMonth(month, offset);
    setMonth(next);
    setSelectedDate(`${next}-01`);
  }

  function goToday() {
    const key = getTaipeiDateKey()!;
    setToday(key);
    setMonth(key.slice(0, 7));
    setSelectedDate(key);
  }

  function selectDay(key: string) {
    setSelectedDate(key);
    setMonth(key.slice(0, 7));
  }

  return (
    <AppShell>
      <main className="px-3 pt-4 pb-6">
        <Link href="/events" className="inline-flex min-h-12 items-center text-base font-medium text-lion-gold">← 返回活動列表</Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold"><CalendarIcon className="h-6 w-6" />活動行事曆</h1>
        <p className="mt-2 text-base text-lion-muted">所有日期與時間皆為台灣時間。點選日期，下方可查看當日活動。</p>

        <section aria-label="月份與日期選擇" className="mt-5 rounded-2xl border border-lion-border bg-lion-card p-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="calendar-month" aria-live="polite" className="text-xl font-bold">{monthLabel}</h2>
            <button type="button" onClick={goToday} className="min-h-12 rounded-xl border border-lion-border px-4 text-base font-semibold text-lion-gold">今天</button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => changeMonth(-1)} aria-label="上一個月" className="min-h-12 rounded-xl bg-lion-soft px-3 text-base font-semibold">← 上個月</button>
            <button type="button" onClick={() => changeMonth(1)} aria-label="下一個月" className="min-h-12 rounded-xl bg-lion-soft px-3 text-base font-semibold">下個月 →</button>
          </div>
          <p className="mt-3 text-sm text-lion-muted" aria-live="polite">{loading ? "正在載入活動…" : error ? "活動資料尚未載入，請在下方重試。" : `本月共 ${monthCount} 場活動。日期下方標示活動場次。`}</p>
          <div className="mt-3 overflow-x-auto pb-1" tabIndex={0} role="region" aria-label="月曆；窄螢幕可左右滑動">
            <table className="w-full min-w-[350px] table-fixed border-separate border-spacing-0.5" aria-labelledby="calendar-month">
              <thead>
                <tr>{weekDays.map((day) => <th key={day} scope="col" className="pb-2 text-base font-medium text-lion-muted">{day}</th>)}</tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }, (_, week) => (
                  <tr key={week}>
                    {days.slice(week * 7, week * 7 + 7).map((day) => {
                      const count = eventsByDate.get(day.dateKey)?.length ?? 0;
                      const selected = selectedDate === day.dateKey;
                      return (
                        <td key={day.dateKey} className="p-0 align-top">
                          <button
                            type="button"
                            onClick={() => selectDay(day.dateKey)}
                            aria-label={`${dateLabel(day.dateKey)}${day.dateKey === today ? "，今天" : ""}，${loading || error ? "活動尚未載入" : `${count} 場活動`}`}
                            aria-pressed={selected}
                            aria-current={day.dateKey === today ? "date" : undefined}
                            className={`flex min-h-[72px] w-full min-w-12 flex-col items-center justify-center rounded-xl border-2 px-0.5 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lion-action ${selected ? "border-lion-action bg-lion-action text-lion-navyDeep" : day.dateKey === today ? "border-lion-action bg-lion-soft text-lion-cream" : day.inMonth ? "border-transparent bg-lion-soft text-lion-cream" : "border-transparent text-lion-muted"}`}
                          >
                            <span className="text-lg font-semibold">{day.day}</span>
                            <span className="min-h-5 text-sm font-medium">{!loading && !error && count > 0 ? `${count}場` : day.dateKey === today ? "今天" : ""}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-lion-muted">小螢幕或放大文字時，月曆可左右滑動。</p>
        </section>

        <section className="mt-6" aria-labelledby="selected-day-heading" aria-busy={loading}>
          <h2 id="selected-day-heading" className="text-xl font-bold">{dateLabel(selectedDate)}</h2>
          {loading ? (
            <p role="status" className="py-6 text-base text-lion-muted">正在載入活動，請稍候…</p>
          ) : error ? (
            <div role="alert" className="mt-3 rounded-xl border border-lion-danger/40 bg-lion-card p-4">
              <p className="text-base text-lion-danger">{error}</p>
              <button type="button" onClick={() => void loadEvents()} className="mt-3 min-h-12 rounded-xl bg-lion-action px-5 text-base font-semibold text-lion-navyDeep">重新載入活動</button>
            </div>
          ) : selectedEvents.length === 0 ? (
            <p role="status" className="mt-3 rounded-xl border border-lion-border bg-lion-card p-5 text-base text-lion-muted">這一天沒有活動，可選擇其他日期或切換月份。</p>
          ) : (
            <div className="mt-3 space-y-3">
              <p role="status" className="text-base text-lion-muted">當日共 {selectedEvents.length} 場活動</p>
              {selectedEvents.map((event) => (
                <Link key={event.id} href={`/events/${event.id}`} className="block min-h-12 rounded-2xl border border-lion-border bg-lion-card p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lion-action">
                  <div className="flex flex-wrap items-center gap-2">
                    <time dateTime={event.startAt} className="text-lg font-bold text-lion-gold">{timeFormatter.format(new Date(event.startAt))}</time>
                    {event.isRegistered && <span className="rounded-lg bg-lion-soft px-2 py-1 text-sm font-semibold">已報名</span>}
                    {event.isFull && <span className="rounded-lg bg-lion-soft px-2 py-1 text-sm font-semibold text-lion-danger">名額已滿</span>}
                  </div>
                  <h3 className="mt-2 break-words text-lg font-bold">{event.title}</h3>
                  <p className="mt-1 break-words text-base text-lion-muted">{event.hostChapter}</p>
                  <p className="mt-2 flex items-start gap-1 text-base text-lion-muted"><PinIcon className="mt-1 h-4 w-4 shrink-0" /><span className="break-words">{event.location || "地點待公告"}</span></p>
                  {event.capacity != null && <p className="mt-2 text-sm text-lion-muted">已報名 {event.registeredCount}／{event.capacity} 人</p>}
                  <span className="mt-3 inline-block text-base font-semibold text-lion-gold">查看活動詳情 →</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
