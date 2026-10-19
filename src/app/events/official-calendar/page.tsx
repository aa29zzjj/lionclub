"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { PinIcon } from "@/components/icons";

type OfficialEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  venueName: string | null;
  address: string | null;
};

function formatDate(value: string, allDay: boolean) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit",
    ...(allDay ? {} : { hour: "2-digit", minute: "2-digit" }),
    timeZone: "Asia/Taipei",
  });
}

export default function OfficialCalendarPage() {
  const router = useRouter();
  const [events, setEvents] = useState<OfficialEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/events/official-calendar", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { router.replace("/login?reason=session-expired"); return; }
      if (!res.ok) throw new Error(data.error ?? "無法載入官方行事曆");
      setEvents(data.events ?? []);
    } catch (error) {
      setLoadError(error instanceof Error && !(error instanceof TypeError) ? error.message : "連線中斷，請重試");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-8">
        <button onClick={() => router.back()} className="min-h-12 text-base text-lion-muted mb-2">← 返回</button>
        <h1 className="text-xl font-bold mb-1">300A1 區官方行事曆</h1>
        <p className="text-sm text-lion-muted mb-4">
          直接讀取國際獅子會 300A1 區官網的公開行事曆（未來 60 天），僅供查看；報名與詳情請至
          <a href="https://www.300a1.org.tw/Activity/Calendar" target="_blank" rel="noreferrer" className="text-lion-gold underline mx-1">官方網站</a>
          確認，不是本平台發布的活動。
        </p>

        {loading && <p role="status" className="text-base text-lion-muted text-center py-8">載入中…</p>}
        {loadError && (
          <div role="alert" className="rounded-xl border border-lion-danger/40 bg-lion-card p-4">
            <p className="text-base text-lion-danger">{loadError}</p>
            <button type="button" onClick={() => void loadEvents()} disabled={loading} className="mt-3 min-h-12 rounded-xl bg-lion-action px-5 text-base font-semibold text-lion-navyDeep disabled:opacity-50">重新載入</button>
          </div>
        )}
        {!loading && !loadError && events.length === 0 && (
          <p className="text-base text-lion-muted text-center py-8">未來 60 天內官方行事曆沒有資料</p>
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
