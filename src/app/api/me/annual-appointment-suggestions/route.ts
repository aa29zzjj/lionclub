import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { isTrustedBrowserMutation } from "@/lib/browser-origin";
import { findAnnualAppointmentSuggestions, RosterMatchError } from "@/lib/annual-appointment-match";
import { serializeExperience } from "@/lib/member-experience";
import { isRosterSchemaUnavailable, RosterConsentError } from "@/lib/roster-consent";
import { positionOptions } from "@/lib/experience-data";

const response = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
function failure(error: unknown) {
  if (error instanceof RosterConsentError || error instanceof RosterMatchError) return response({ error: error.message, code: error.code }, error.status);
  if (isRosterSchemaUnavailable(error)) return response({ error: "名冊功能尚未完成部署，請稍後重試；仍可手動填寫資歷。", code: "ROSTER_MATCH_UNAVAILABLE" }, 503);
  if (error && typeof error === "object" && "code" in error && ["P2034", "P2002", "P2003"].includes(String(error.code))) return response({ error: "名冊、同意或帳號狀態已更新，請重新載入後核對。", code: "ROSTER_MATCH_CHANGED" }, 409);
  return null;
}

export async function GET() {
  const me = await getCurrentMember();
  if (!me) return response({ error: "未登入" }, 401);
  try {
    const prisma = await getPrisma();
    const result = await prisma.$transaction(tx => findAnnualAppointmentSuggestions(tx, { memberId: me.id }), { isolationLevel: "RepeatableRead" });
    return response({ ...result, suggestions: result.suggestions.map(s => ({
      id: s.id, positionName: s.positionName, listingNature: s.listingNature, sourcePage: s.sourcePage,
      sourceRosterYear: s.yearStart, organizationName: s.organization.name, requiresActualYears: s.listingNature !== "現任職務",
    })) });
  } catch (error) {
    if (error instanceof RosterConsentError && error.code === "ROSTER_CONSENT_REQUIRED") return response({ consentRequired: true, matchStatus: "consent_required", canImport: false, suggestions: [] });
    const result = failure(error); if (result) return result; throw error;
  }
}

const claimSchema = z.object({ appointmentId: z.string().trim().min(1).max(200), confirmOwnRecord: z.literal(true),
  actualStartYear: z.number().int().min(1917).max(2200).optional(), actualEndYear: z.number().int().min(1917).max(2200).optional(),
  confirmHistoricalYears: z.literal(true).optional(),
});

export async function POST(request: NextRequest) {
  if (!isTrustedBrowserMutation(request)) return response({ error: "請從網站操作" }, 403);
  const me = await getCurrentMember();
  if (!me) return response({ error: "未登入" }, 401);

  const parsed = claimSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ error: "請明確確認這是本人的任職資料，並以正確格式填寫。" }, 400);

  const prisma = await getPrisma();
  try {
    const experience = await prisma.$transaction(async (tx) => {
      const matches = await findAnnualAppointmentSuggestions(tx, { memberId: me.id });
      if (!matches.canImport) throw new RosterMatchError(409, "ROSTER_CANDIDATE_ONLY", "分會歸屬或資料尚待唯一核對；候選資料不能直接認領，仍可自行手填資歷。");
      const appointment = matches.suggestions.find(row => row.id === parsed.data.appointmentId);
      if (!appointment) throw new RosterMatchError(404, "ROSTER_SUGGESTION_NOT_FOUND", "找不到可帶入的本人名冊建議；資料可能已更新或已帶入。");
      const historical = appointment.listingNature !== "現任職務";
      if (historical && (parsed.data.confirmHistoricalYears !== true || parsed.data.actualStartYear === undefined || parsed.data.actualEndYear === undefined ||
        parsed.data.actualEndYear < parsed.data.actualStartYear || parsed.data.actualEndYear > appointment.yearStart)) {
        throw new RosterMatchError(400, "ACTUAL_TERM_REQUIRED", "歷任／榮譽名冊年度不是實際任期；請自行確認並填寫實際開始、最後任期年度，不確定時不要帶入。");
      }
      if (!historical && (parsed.data.actualStartYear !== undefined || parsed.data.actualEndYear !== undefined)) throw new RosterMatchError(400, "SOURCE_TERM_MISMATCH", "本年度列載使用來源年度；不能以帶入參數改寫來源。");
      const startYear = historical ? parsed.data.actualStartYear! : appointment.yearStart;
      const endYear = historical ? parsed.data.actualEndYear! : appointment.yearStart;
      const positions = positionOptions.filter(option => option.label === appointment.positionName && option.level === appointment.organization.level);
      const known = positions.length === 1 ? positions[0] : null;
      const kind = known?.kind ?? (appointment.listingNature === "榮譽列載" ? "honorary" : "position");
      return tx.memberExperience.create({
        data: {
          memberId: me.id,
          kind,
          level: appointment.organization.level,
          positionCode: known?.code ?? appointment.positionName,
          organizationId: appointment.organization.id,
          organizationName: appointment.organization.name,
          organizationIsUnlisted: false,
          districtCode: appointment.organization.districtCode,
          startYear, endYear,
          datePrecision: "lions_year",
          isCurrent: appointment.listingNature === "現任職務",
          verificationStatus: "under_review", visibility: "only_me", verifiedById: null, verifiedAt: null,
          note: `本人確認帶入：${appointment.yearStart}-${appointment.yearStart + 1} 年度核定名冊第 ${appointment.sourcePage} 頁；原文職稱「${appointment.positionName}」，列載性質「${appointment.listingNature}」。${historical ? `來源年度僅為列載年度；實際任期 ${startYear}-${endYear + 1} 由本人另行填寫，未核實。` : "任期依本年度現任列載帶入，仍未核實。"}姓名與分會比對不是身分或管理授權驗證。`,
          sourceAppointmentId: appointment.id,
        },
      });
    }, { isolationLevel: "Serializable" });
    return response({ experience: serializeExperience(experience) }, 201);
  } catch (error) {
    const result = failure(error); if (result) return result;
    throw error;
  }
}
