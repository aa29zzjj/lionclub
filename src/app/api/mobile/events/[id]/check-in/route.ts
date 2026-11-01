import { NextRequest, NextResponse } from "next/server";
import { requireMobileMember } from "@/lib/mobile-request-auth";
import { AttendanceError, checkInInputSchema, checkInMember } from "@/lib/event-attendance";
import { canManageEvent } from "@/lib/event-scope";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileMember(req);
  if (!auth) return NextResponse.json({ error: "未登入或登入已過期" }, { status: 401 });

  const parsed = checkInInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "請填寫 QR 或會員與補登原因" }, { status: 400 });
  const { id } = await params;
  try {
    return NextResponse.json(await checkInMember(auth.prisma, auth.member.id, id, parsed.data,
      (tx, actorId, _organizationId, event) => canManageEvent(tx, actorId, event)));
  } catch (error) {
    if (error instanceof AttendanceError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
