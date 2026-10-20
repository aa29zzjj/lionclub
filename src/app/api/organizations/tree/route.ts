import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { getCurrentLionYearStart } from "@/lib/lion-year";
import { rosterDirectoryEligibility, safeDirectoryLabel } from "@/lib/roster-directory";
import { isRosterSchemaUnavailable } from "@/lib/roster-consent";

export async function GET(req: NextRequest) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const parentId = searchParams.get("parentId");
  const yearStart = getCurrentLionYearStart();

  const prisma = await getPrisma();
  const organizations = await prisma.organization.findMany({
    where: { isActive: true, parentId: parentId ?? null },
    select: { id: true, level: true, name: true, districtCode: true },
    orderBy: { name: "asc" },
    take: 500,
  });

  const hierarchy = process.env.ROSTER_DIRECTORY_DISCLOSURE_VERSION ? await prisma.organization.findMany({ select: {
    id: true, name: true, level: true, parentId: true, districtCode: true, isActive: true, validFrom: true, validTo: true,
  } }) : [];
  const eligibility = rosterDirectoryEligibility(me, hierarchy);
  const visible = organizations.filter(org => eligibility.organizationIds.includes(org.id));
  type Officer = { positionName: string; personName: string; sourceRosterYear: number; listingNature: string };
  const officersByOrg = new Map<string, Officer[]>();
  const truncated = new Set<string>();
  let directoryStatus = eligibility.status;
  if (visible.length) try {
    const officers = await prisma.annualAppointment.findMany({
      where: { organizationId: { in: visible.map(org => org.id) }, yearStart, listingNature: "現任職務" },
      select: { organizationId: true, positionName: true, personName: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 201,
    });
    for (const officer of officers.slice(0, 200)) {
      if (!safeDirectoryLabel(officer.personName, 100) || !safeDirectoryLabel(officer.positionName, 200)) continue;
      const list = officersByOrg.get(officer.organizationId) ?? [];
      if (list.length >= 50) { truncated.add(officer.organizationId); continue; }
      list.push({ positionName: officer.positionName, personName: officer.personName, sourceRosterYear: yearStart, listingNature: "現任職務" });
      officersByOrg.set(officer.organizationId, list);
    }
    if (officers.length > 200) visible.forEach(org => truncated.add(org.id));
  } catch (error) {
    if (isRosterSchemaUnavailable(error)) directoryStatus = "unavailable";
    else throw error;
  }

  return NextResponse.json({
    directory: { status: directoryStatus, sourceRosterYear: yearStart, message: directoryStatus === "approval_required"
      ? "待營運者確認名冊揭露授權；目前僅提供組織架構。"
      : directoryStatus === "unavailable" ? "名冊資料尚未完成部署，稍後可重試；目前僅提供組織架構。"
      : directoryStatus !== "scoped" ? "分會歸屬或直屬層級尚待確認；目前僅提供組織架構。"
      : "姓名目錄僅限核定揭露範圍內、已確認分會的內部會員；名冊列載不等於管理授權。" },
    organizations: organizations.map((o) => ({
      ...o,
      hasChildren: o.level !== "club",
      officers: officersByOrg.get(o.id) ?? [],
      officersTruncated: truncated.has(o.id),
      officerAccess: eligibility.organizationIds.includes(o.id) ? directoryStatus : directoryStatus === "approval_required" ? "approval_required" : "out_of_scope",
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
