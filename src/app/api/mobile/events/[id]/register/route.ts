import { NextRequest, NextResponse } from "next/server";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { AttendanceError, toggleEventRegistration } from "@/lib/event-attendance";

// 切換目前會員的報名狀態：已報名就取消，未報名就報名
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileMember(req);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });

  const { id } = await params;
  try { return NextResponse.json(await toggleEventRegistration(auth.prisma, auth.member.id, id)); }
  catch (error) {
    if (error instanceof AttendanceError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
