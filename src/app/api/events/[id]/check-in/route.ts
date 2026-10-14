import { NextRequest, NextResponse } from "next/server";
import { getCurrentMember, hasAdminRoleForOrganization } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { AttendanceError, checkInInputSchema, checkInMember, EVENT_ATTENDANCE_ROLES } from "@/lib/event-attendance";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作報到" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const parsed = checkInInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "請填寫 QR 或會員與補登原因" }, { status: 400 });
  const { id } = await params;
  try {
    return NextResponse.json(await checkInMember(await getPrisma(), me.id, id, parsed.data,
      (tx, actorId, organizationId) => hasAdminRoleForOrganization(actorId, organizationId, EVENT_ATTENDANCE_ROLES, tx)));
  } catch (error) {
    if (error instanceof AttendanceError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
