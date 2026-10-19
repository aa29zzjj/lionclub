import { NextRequest, NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/current-member";
import { fetchDistrictCalendarEvents } from "@/lib/district-calendar";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function defaultRange() {
  const today = new Date();
  const from = new Date(today);
  const to = new Date(today);
  to.setDate(to.getDate() + 60);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
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
