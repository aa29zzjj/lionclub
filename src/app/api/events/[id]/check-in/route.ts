import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentMember, hasAdminRoleForOrganization } from "@/lib/current-member";
import { getPrisma } from "@/lib/prisma";
import { parseFriendQrPayload } from "@/lib/friend-qr";

const managementRoles = [
  "CLUB_OFFICER",
  "CLUB_VICE_PRESIDENT",
  "CLUB_PRESIDENT",
  "ZONE_ADMIN",
  "DISTRICT_ADMIN",
  "MULTIDISTRICT_ADMIN",
  "SUPER_ADMIN",
];

const bodySchema = z.object({ qrValue: z.string().trim().min(1) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id: eventId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少 QR 內容" }, { status: 400 });

  const memberId = parseFriendQrPayload(parsed.data.qrValue);
  if (!memberId) return NextResponse.json({ error: "這不是有效的會員證 QR Code" }, { status: 400 });

  const prisma = await getPrisma();
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, createdById: true, hostOrganizationId: true },
  });
  if (!event) return NextResponse.json({ error: "找不到此活動" }, { status: 404 });

  const canManage =
    event.createdById === me.id || (await hasAdminRoleForOrganization(me.id, event.hostOrganizationId, managementRoles));
  if (!canManage) return NextResponse.json({ error: "沒有權限為此活動報到" }, { status: 403 });

  const registration = await prisma.eventRegistration.findUnique({
    where: { eventId_memberId: { eventId, memberId } },
    include: { member: { select: { id: true, name: true, nickname: true, photoUrl: true } } },
  });
  if (!registration || registration.status !== "REGISTERED") {
    const target = await prisma.member.findUnique({ where: { id: memberId }, select: { name: true, nickname: true } });
    return NextResponse.json(
      { error: `${target?.nickname || target?.name || "此會員"} 尚未報名「${event.title}」` },
      { status: 404 }
    );
  }

  if (registration.checkedInAt) {
    return NextResponse.json({
      ok: true,
      alreadyCheckedIn: true,
      member: registration.member,
      checkedInAt: registration.checkedInAt,
    });
  }

  const updated = await prisma.eventRegistration.update({
    where: { id: registration.id },
    data: { checkedInAt: new Date(), checkedInById: me.id },
    include: { member: { select: { id: true, name: true, nickname: true, photoUrl: true } } },
  });

  return NextResponse.json({ ok: true, alreadyCheckedIn: false, member: updated.member, checkedInAt: updated.checkedInAt });
}
