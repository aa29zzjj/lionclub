import { NextRequest, NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/current-member";
import { fetchDistrictCalendarEvents } from "@/lib/district-calendar";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return NextResponse.json({ error: "日期格式錯誤" }, { status: 400 });

  try {
    const events = await fetchDistrictCalendarEvents(from, to);
    return NextResponse.json({ source: "300a1.org.tw", events });
  } catch {
    return NextResponse.json({ error: "官方行事曆暫時無法取得，請稍後再試或直接前往 300A1 區官網查看" }, { status: 502 });
  }
}
