import { NextRequest, NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/current-member";
import { DISTRICT_CALENDAR_SOURCE, fetchDistrictCalendarEvents, validCalendarRange } from "@/lib/district-calendar";

// The district calendar is Taipei-local; compute "today" in Taipei, not UTC.
function taipeiDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(d);
}

function defaultRange() {
  return { from: taipeiDate(0), to: taipeiDate(60) };
}

export async function GET(req: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const fallback = defaultRange();
  const from = searchParams.get("from") ?? fallback.from;
  const to = searchParams.get("to") ?? fallback.to;
  if (!validCalendarRange(from, to)) return NextResponse.json({ error: "請選擇有效日期，結束日須晚於開始日，且範圍不得超過 366 天。" }, { status: 400 });

  try {
    const events = await fetchDistrictCalendarEvents(from, to);
    return NextResponse.json({ source: "300a1.org.tw", sourceUrl: DISTRICT_CALENDAR_SOURCE, from, to, checkedAt: new Date().toISOString(), cacheSeconds: 600, readOnly: true, events }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "官方行事曆暫時無法取得，請稍後再試或直接前往 300A1 區官網查看" }, { status: 502 });
  }
}
