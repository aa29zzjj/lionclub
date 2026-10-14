import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { AttendanceError, toggleEventRegistration } from "@/lib/event-attendance";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";

// 切換目前會員的報名狀態：已報名就取消，未報名就報名
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作報名" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  try { return NextResponse.json(await toggleEventRegistration(await getPrisma(), me.id, id)); }
  catch (error) {
    if (error instanceof AttendanceError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
