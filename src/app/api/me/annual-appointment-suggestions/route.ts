import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { bareClubName, findAnnualAppointmentSuggestions } from "@/lib/annual-appointment-match";
import { serializeExperience } from "@/lib/member-experience";

const listingNatureKind: Record<string, "position" | "honorary"> = {
  "現任職務": "position",
  "歷任列載": "position",
  "榮譽列載": "honorary",
};

export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const prisma = await getPrisma();
  const suggestions = await findAnnualAppointmentSuggestions(prisma, { name: me.name, organizationName: me.organization.name });

  return NextResponse.json({
    suggestions: suggestions.map((s) => ({
      id: s.id,
      positionName: s.positionName,
      listingNature: s.listingNature,
      sourcePage: s.sourcePage,
      yearStart: s.yearStart,
      organizationName: s.organization.name,
    })),
  });
}

const claimSchema = z.object({ appointmentId: z.string().trim().min(1).max(200) });

export async function POST(request: NextRequest) {
  if (!isTrustedBrowserMutation(request)) return NextResponse.json({ error: "請從網站操作" }, { status: 403 });
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const parsed = claimSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "欄位格式錯誤" }, { status: 400 });

  const prisma = await getPrisma();
  try {
    const experience = await prisma.$transaction(async (tx) => {
      const actor = await tx.member.findFirst({ where: { id: me.id, status: "ACTIVE", deletedAt: null }, select: { id: true, name: true, organization: { select: { name: true } } } });
      if (!actor) throw new Error("ACCOUNT_CHANGED");

      const appointment = await tx.annualAppointment.findUnique({
        where: { id: parsed.data.appointmentId },
        include: { organization: { select: { id: true, name: true, level: true } }, claimedByExperience: { select: { id: true } } },
      });
      if (!appointment || appointment.claimedByExperience) throw new Error("NOT_FOUND");
      // Re-verify the match server-side; never trust the client's appointmentId alone.
      if (appointment.personName !== actor.name || appointment.homeClubSourceName !== bareClubName(actor.organization.name)) throw new Error("NOT_FOUND");

      const kind = listingNatureKind[appointment.listingNature] ?? "position";
      return tx.memberExperience.create({
        data: {
          memberId: me.id,
          kind,
          level: appointment.organization.level,
          positionCode: appointment.positionName,
          organizationId: appointment.organization.id,
          organizationName: appointment.organization.name,
          organizationIsUnlisted: false,
          startYear: appointment.yearStart,
          datePrecision: "lions_year",
          isCurrent: appointment.listingNature === "現任職務",
          verificationStatus: "self_declared",
          visibility: "members",
          note: `來自 ${appointment.yearStart}-${appointment.yearStart + 1} 年度核定名冊（第 ${appointment.sourcePage} 頁），帶入後仍須依平台核實分工審核。`,
          sourceAppointmentId: appointment.id,
        },
      });
    });
    return NextResponse.json({ experience: serializeExperience(experience) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "找不到此筆名冊建議，可能已被帶入或資料已更新" }, { status: 404 });
    if (error instanceof Error && error.message === "ACCOUNT_CHANGED") return NextResponse.json({ error: "帳號已更新，請重新登入" }, { status: 409 });
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ error: "此筆名冊建議已被帶入" }, { status: 409 });
    throw error;
  }
}
