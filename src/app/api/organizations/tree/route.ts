import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { getCurrentLionYearStart } from "@/lib/lion-year";

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

  const officers = await prisma.annualAppointment.findMany({
    where: { organizationId: { in: organizations.map((o) => o.id) }, yearStart, listingNature: "現任職務" },
    select: { organizationId: true, positionName: true, personName: true },
    orderBy: { createdAt: "asc" },
  });
  const officersByOrg = new Map<string, { positionName: string; personName: string }[]>();
  for (const officer of officers) {
    const list = officersByOrg.get(officer.organizationId) ?? [];
    list.push({ positionName: officer.positionName, personName: officer.personName });
    officersByOrg.set(officer.organizationId, list);
  }

  return NextResponse.json({
    organizations: organizations.map((o) => ({
      ...o,
      hasChildren: o.level !== "club",
      officers: officersByOrg.get(o.id) ?? [],
    })),
  });
}
