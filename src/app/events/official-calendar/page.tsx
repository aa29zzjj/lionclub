"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { PinIcon } from "@/components/icons";
import { currentMembershipCalendarYear } from "@/lib/district-calendar";
import { calendarMonthRange, getTaipeiDateKey, shiftCalendarMonth } from "@/lib/event-calendar";

type OfficialEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  venueName: string | null;
  address: string | null;
};

// Upstream times carry no offset and are already Taipei-local; never pass them through Date,
// which would reinterpret them in the viewer's device timezone.
function formatDate(value: string, allDay: boolean) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!match) return value;
  const [, y, m, d, hh, mm] = match;
  if (allDay || !hh) return `${y}/${m}/${d}（全天）`;
  const hour = Number(hh);
  const period = hour < 12 ? "上午" : "下午";
  const hour12 = String(hour % 12 === 0 ? 12 : hour % 12).padStart(2, "0");
  return `${y}/${m}/${d} ${period}${hour12}:${mm}`;
}

export default function OfficialCalendarPage() {
  const router = useRouter();
  const [events, setEvents] = useState<OfficialEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [month, setMonth] = useState(() => getTaipeiDateKey()!.slice(0, 7));
  const year = Number(month.slice(0, 4)) - (Number(month.slice(5, 7)) < 7 ? 1 : 0);
  const years = [...new Set([year, ...[-2, -1, 0, 1].map((offset) => currentMembershipCalendarYear() + offset)])].sort((a, b) => a - b);
  const [checkedAt, setCheckedAt] = useState("");
  const [attempt, setAttempt] = useState(0);

  const loadEvents = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setLoadError("");
    setEvents([]);
    setCheckedAt("");
    try {
      const range = calendarMonthRange(month);
      const res = await fetch(`/api/events/official-calendar?from=${range.from}&to=${range.to}`, { cache: "no-store", signal });
      const data = await res.json().catch(() => ({}));
      if (signal.aborted) return;
      if (res.status === 401) { router.replace("/login?reason=session-expired"); return; }
      if (!res.ok) throw new Error(data.error ?? "無法載入官方行事曆");
      setEvents(data.events ?? []);
      setCheckedAt(typeof data.checkedAt === "string" ? data.checkedAt : "");
    } catch (error) {
      if (signal.aborted) return;
      setLoadError(error instanceof Error && !(error instanceof TypeError) ? error.message : "連線中斷，請重試");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [router, month]);

  useEffect(() => { const controller = new AbortController(); void loadEvents(controller.signal); return () => controller.abort(); }, [loadEvents, attempt]);

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-8">
        <button onClick={() => router.back()} className="min-h-12 text-base text-lion-muted mb-2">← 返回</button>
        <h1 className="text-xl font-bold mb-1">300A-1 區官方行事曆</h1>
        <p className="text-sm text-lion-muted mb-4">
          讀取國際獅子會 300A-1 區官網的公開行事曆，僅供查看；報名與詳情請至
          <a href="https://www.300a1.org.tw/Activity/Calendar" target="_blank" rel="noreferrer" className="text-lion-gold underline mx-1">官方網站</a>
          確認，不是本平台發布的活動。
        </p>
        <label htmlFor="official-calendar-year" className="mb-1 block text-sm font-medium">會籍年度（7 月至翌年 6 月）</label>
        <div className="mb-3 flex gap-2"><select id="official-calendar-year" value={year} onChange={(event) => { const y = Number(event.target.value); setMonth(`${y + (Number(month.slice(5)) < 7 ? 1 : 0)}-${month.slice(5)}`); }} className="min-h-12 min-w-0 flex-1 rounded-xl border border-lion-border bg-lion-card px-3 text-base">{years.map((y) => <option key={y} value={y}>{y}-{y + 1}</option>)}</select><button type="button" disabled={loading} onClick={() => setAttempt((value) => value + 1)} className="min-h-12 rounded-xl border border-lion-border px-3 text-sm disabled:opacity-50">重新查詢</button></div>
        <label htmlFor="official-calendar-month" className="mb-1 block text-sm font-medium">查看月份（台灣時間）</label>
        <select id="official-calendar-month" value={month} onChange={(event) => setMonth(event.target.value)} className="mb-2 min-h-12 w-full rounded-xl border border-lion-border bg-lion-card px-3 text-base">{Array.from({ length: 12 }, (_, i) => { const value = shiftCalendarMonth(`${year}-07`, i); return <option key={value} value={value}>{value.replace('-', ' 年 ')} 月</option>; })}</select>
        <nav aria-label="官方行事曆月份導覽" className="mb-3 grid grid-cols-3 gap-2">
          <button type="button" onClick={() => setMonth(shiftCalendarMonth(month, -1))} className="min-h-12 rounded-xl border border-lion-border px-2 text-sm">← 上個月</button>
          <button type="button" onClick={() => setMonth(getTaipeiDateKey()!.slice(0, 7))} className="min-h-12 rounded-xl border border-lion-border px-2 text-sm">回本月</button>
          <button type="button" onClick={() => setMonth(shiftCalendarMonth(month, 1))} className="min-h-12 rounded-xl border border-lion-border px-2 text-sm">下個月 →</button>
        </nav>
        <h2 aria-live="polite" className="mb-2 text-lg font-bold">{month.replace('-', ' 年 ')} 月</h2>
        <p className="mb-4 text-xs leading-relaxed text-lion-muted">重新開啟或查詢時讀取最新可用快取（最多 10 分鐘）。不在背景推播、不自動報名，也不寫入本平台活動。{checkedAt && !loading && !loadError ? `查詢時間：${new Date(checkedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}（台灣時間，非官網修改時間）。` : ""}</p>

        {loading && <p role="status" className="text-base text-lion-muted text-center py-8">載入中…</p>}
        {loadError && (
          <div role="alert" className="rounded-xl border border-lion-danger/40 bg-lion-card p-4">
            <p className="text-base text-lion-danger">{loadError}</p>
            <button type="button" onClick={() => setAttempt((value) => value + 1)} disabled={loading} className="mt-3 min-h-12 rounded-xl bg-lion-action px-5 text-base font-semibold text-lion-navyDeep disabled:opacity-50">重新載入</button>
          </div>
        )}
        {!loading && !loadError && events.length === 0 && (
          <p className="text-base text-lion-muted text-center py-8">此月份官方行事曆沒有資料</p>
        )}
        {!loading && !loadError && (
          <div className="flex flex-col gap-3">
            {events.map((ev) => (
              <div key={ev.id} className="rounded-2xl bg-lion-card border border-lion-border p-4">
                <p className="text-lg font-semibold break-words">{ev.title}</p>
                <p className="text-sm text-lion-muted mt-1">{formatDate(ev.start, ev.allDay)}（台灣時間）</p>
                {ev.venueName && (
                  <div className="flex items-start gap-2 text-sm text-lion-muted mt-2">
                    <PinIcon className="w-4 h-4 text-lion-gold mt-0.5 shrink-0" />
                    <span>{ev.venueName}{ev.address ? `｜${ev.address}` : ""}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
